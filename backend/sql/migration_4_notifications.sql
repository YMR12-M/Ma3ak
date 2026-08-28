-- ============================================
-- MA3ak (معاك) - ترقية نظام الإشعارات + المنبه
--
-- الملف ده تاريخي زي migration_2 و migration_3: schema.sql اتحدّث ليشمل كل
-- اللي تحت، فقاعدة اتعملت بـ schema.sql الحالي **متشغّلش عليها الملف ده**
-- (الأعمدة موجودة بالفعل وهيفشل). هو بس للقواعد اللي اتعملت قبل الترقية دي.
--
-- شغّله بـ:  mysql -u root -p ma3ak < migration_4_notifications.sql
-- ============================================

USE ma3ak;

-- ---------- 1) اشتراكات الـ Web Push ----------
-- كل صف = متصفح واحد على جهاز واحد وافق يستقبل إشعارات. المستخدم الواحد ممكن
-- يكون عنده أكتر من صف (موبايل + لابتوب). endpoint هو العنوان اللي بنبعت عليه
-- فعليًا، وهو فريد عالميًا - فبيصلح كمفتاح UNIQUE لوحده.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  endpoint VARCHAR(500) NOT NULL,
  p256dh VARCHAR(255) NOT NULL,     -- مفتاح التشفير العام بتاع المتصفح
  auth VARCHAR(255) NOT NULL,       -- سر المصادقة بتاع المتصفح
  user_agent VARCHAR(255) NULL,     -- عشان المستخدم يعرف "ده أنهي جهاز" لو حب يشيله
  fail_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
  last_success_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_endpoint (endpoint(191)),
  KEY idx_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------- 2) تفضيلات الإشعارات (على السيرفر مش على الجهاز) ----------
-- قبل كده كل الإعدادات كانت في localStorage، يعني بتضيع مع تغيير الجهاز.
-- دي التفضيلات اللي المفروض تتبع الحساب نفسه.
CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id INT PRIMARY KEY,
  push_enabled TINYINT(1) NOT NULL DEFAULT 1,
  -- ساعات الهدوء: بتأجّل الإشعارات العادية بس. أي إشعار priority='critical'
  -- بيعدّي مهما كان الوقت - ده الفرق بين "مفكّرة" و"شبكة أمان".
  quiet_start TIME NULL,
  quiet_end TIME NULL,
  -- تفعيل/إيقاف لكل نوع على حدة
  pref_dose_due TINYINT(1) NOT NULL DEFAULT 1,
  pref_missed_dose TINYINT(1) NOT NULL DEFAULT 1,
  pref_appointment TINYINT(1) NOT NULL DEFAULT 1,
  pref_patient_issue TINYINT(1) NOT NULL DEFAULT 1,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------- 3) توسيع جدول الإشعارات ----------
ALTER TABLE notifications
  MODIFY COLUMN type ENUM(
    'missed_dose',
    'upcoming_appointment',
    'general',
    'patient_issue',
    'dose_due',
    'dose_reminder',
    'dose_escalation'
  ) NOT NULL;

ALTER TABLE notifications
  -- الأولوية: بتحدد الشكل البصري، وهل الإشعار بيخترق ساعات الهدوء ولا لأ
  ADD COLUMN priority ENUM('critical','normal','info') NOT NULL DEFAULT 'normal' AFTER type,
  -- مفتاح منع التكرار. قبل كده كان SELECT-ثم-INSERT (فيه سباق: دورتين
  -- scheduler في نفس اللحظة كانوا ممكن يدخّلوا نفس الإشعار مرتين). دلوقتي
  -- INSERT IGNORE + UNIQUE بيمنعه ذرّيًا - نفس أسلوب uniq_dose في doses.
  ADD COLUMN dedupe_key VARCHAR(120) NULL AFTER related_id,
  -- "اتعامل معاه" غير "اتقرا": المتابع شاف البلاغ ≠ المتابع اتصرف
  ADD COLUMN handled_at DATETIME NULL AFTER is_read,
  -- سجل التوصيل: من غيره مفيش طريقة تعرف إن الـ push بيفشل بصمت
  ADD COLUMN push_sent_at DATETIME NULL AFTER handled_at,
  ADD COLUMN delivered_at DATETIME NULL AFTER push_sent_at,
  ADD COLUMN clicked_at DATETIME NULL AFTER delivered_at,
  ADD UNIQUE KEY uniq_user_dedupe (user_id, dedupe_key),
  -- الاستعلام الأساسي: إشعارات مستخدم معيّن مرتبة بالأحدث
  ADD KEY idx_user_created (user_id, id);

-- ---------- 4) الجرعات: الغفوة والتصعيد ----------
ALTER TABLE doses
  -- غفوة: بتأجّل رنة الجرعة من غير ما تلغيها ومن غير ما تخليها "فايتة"
  ADD COLUMN snooze_until DATETIME NULL AFTER status,
  ADD COLUMN snooze_count TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER snooze_until,
  -- طوابع "اتبعت مرة واحدة بس" - بديل الاحتفاظ بالحالة في ذاكرة السيرفر
  -- (اللي بتضيع مع أي إعادة تشغيل، وRender بينيّم الخدمة فعلاً)
  ADD COLUMN due_notified_at DATETIME NULL AFTER taken_at,
  ADD COLUMN reminder_notified_at DATETIME NULL AFTER due_notified_at,
  ADD COLUMN escalated_at DATETIME NULL AFTER reminder_notified_at,
  -- الـ scheduler بقى بيلف كل دقيقة على الجرعات المعلّقة - الفهرس ده بيخلي
  -- الاستعلام ده يفضل رخيص مهما كبر الجدول
  ADD KEY idx_status_scheduled (status, scheduled_at);

-- ---------- 5) الأدوية: تحكّم في المنبه لكل دواء ----------
ALTER TABLE medications
  -- دواء حرج: توقيته مش قابل للتأجيل (أنسولين، أدوية قلب...). بيمنع الغفوة
  -- تلقائيًا وبيرفع أولوية إشعار الجرعة الفايتة لـ critical.
  ADD COLUMN is_critical TINYINT(1) NOT NULL DEFAULT 0 AFTER active,
  -- المتابع يقدر يقفل الغفوة لدواء بعينه حتى لو مش "حرج"
  ADD COLUMN snooze_allowed TINYINT(1) NOT NULL DEFAULT 1 AFTER is_critical;
