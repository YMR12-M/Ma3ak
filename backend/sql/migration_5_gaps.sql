-- ============================================
-- MA3ak (معاك) - سد فجوات كشفها فحص كامل للمشروع
--
-- تاريخي زي باقي الـ migrations: schema.sql اتحدّث ليشمل كل اللي تحت، فقاعدة
-- اتعملت بـ schema.sql الحالي **متشغّلش عليها الملف ده**.
--
-- شغّله بـ:  mysql -u root -p ma3ak < migration_5_gaps.sql
-- ============================================

USE ma3ak;

-- ---------- 1) كود استرجاع كلمة المرور ----------
-- المتابع اللي بينسى باسورده كان بيفقد وصوله لبيانات مريضه **نهائيًا** - مفيش
-- إيميل ولا SMS في المشروع، فمفيش أي طريقة استرجاع.
-- الحل من غير أي بنية تحتية خارجية: كود استرجاع بيتعرض مرة واحدة وقت التسجيل،
-- ومتخزّن عندنا **مهشّور زي الباسورد بالظبط** - يعني تسريب قاعدة البيانات
-- مبيدّيش المهاجم طريق للحسابات.
ALTER TABLE users
  ADD COLUMN recovery_hash VARCHAR(255) NULL AFTER password_hash;

-- ---------- 2) صورة الدوا ----------
-- كبار السن بيعرفوا الدوا بشكله ولونه مش باسمه العلمي. "كونكور 5" مش معلومة،
-- صورة الشريط معلومة.
--
-- الصورة متخزّنة base64 في جدول **منفصل** مش عمود في medications: استعلامات
-- قايمة الأدوية بتستخدم SELECT * وبتتنادى كل ما الشاشة تتفتح، فعمود فيه صورة
-- كان هيتشحن مع كل طلب من غير أي داعي.
CREATE TABLE IF NOT EXISTS medication_images (
  medication_id INT PRIMARY KEY,
  mime VARCHAR(40) NOT NULL,
  data MEDIUMTEXT NOT NULL,        -- base64 من غير بادئة data:
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- علم بسيط عشان قايمة الأدوية تعرف "فيه صورة ولا لأ" من غير JOIN على جدول
-- فيه صور، ومن غير ما تشحنها
ALTER TABLE medications
  ADD COLUMN has_image TINYINT(1) NOT NULL DEFAULT 0 AFTER snooze_allowed;

-- ---------- 3) فهرس لتقرير الالتزام ----------
-- التقرير بيقرا كل جرعات مريض في فترة (30 يوم مثلاً). من غير الفهرس ده
-- الاستعلام بيمسح الجدول كله.
ALTER TABLE doses
  ADD KEY idx_patient_scheduled (patient_id, scheduled_at);
