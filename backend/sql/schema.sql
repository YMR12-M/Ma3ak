-- ============================================
-- MA3ak (معاك) - Database schema
-- Run with: mysql -u root -p < schema.sql
-- ============================================

CREATE DATABASE IF NOT EXISTS ma3ak CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ma3ak;

-- المستخدمين: مريض (كبير سن) أو متابع (ابن/بنت/ممرض)
-- المتابع: بيسجل بنفسه بموبايل (إجباري) + إيميل (اختياري) + باسورد.
-- المريض: بيتضاف بمعرفة المتابع، من غير باسورد خالص، وبيدخل عن طريق "لينك دخول" (access_token).
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  recovery_hash VARCHAR(255) NULL,       -- كود استرجاع الباسورد، مهشّور زي الباسورد بالظبط
  role ENUM('patient', 'caregiver') NOT NULL,
  phone VARCHAR(30) NULL UNIQUE,
  link_code VARCHAR(10) UNIQUE NULL,     -- خاص بالمريض، بيستخدمه متابع تاني عشان يشارك في متابعته
  access_token VARCHAR(64) UNIQUE NULL,  -- توكن سري طويل، بديل الباسورد بالكامل لدخول المريض عن طريق لينك
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ربط المتابع بالمريض (متابع واحد ممكن يتابع أكتر من مريض والعكس)
CREATE TABLE IF NOT EXISTS patient_caregiver (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  caregiver_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_link (patient_id, caregiver_id),
  FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (caregiver_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- الأدوية المسجلة لكل مريض
CREATE TABLE IF NOT EXISTS medications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  name VARCHAR(150) NOT NULL,
  dosage VARCHAR(100) NULL,
  notes TEXT NULL,
  times JSON NOT NULL,           -- مثال: ["08:00","14:00","20:00"]
  -- أيام الأسبوع كقناع 7 بت (بت 0 = الأحد ... بت 6 = السبت). 127 = كل الأيام.
  -- من غير العمود ده كل دواء كان يومي بالضرورة، والأدوية الأسبوعية (أليندرونات،
  -- ميثوتريكسات، حقن ب12) مكانش ينفع تتسجّل صح خالص.
  days_of_week TINYINT UNSIGNED NOT NULL DEFAULT 127,
  -- كمية الدوا الفاضلة. NULL = المتابع مش بيتابع الكمية للدوا ده.
  -- بتنقص مع كل جرعة تتسجّل، وبتولّد تنبيه للمتابع قبل ما تخلص بأيام.
  pills_left SMALLINT UNSIGNED NULL,
  -- طابع "اتبعت مرة واحدة" لتنبيه قرب الخلاص - بيترجّع NULL أول ما الكمية تتزوّد
  low_stock_notified_at DATETIME NULL,
  start_date DATE NOT NULL,
  end_date DATE NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  is_critical TINYINT(1) NOT NULL DEFAULT 0,   -- توقيته مش قابل للتأجيل: بيمنع الغفوة ويرفع أولوية الجرعة الفايتة
  snooze_allowed TINYINT(1) NOT NULL DEFAULT 1, -- المتابع يقدر يقفل الغفوة لدواء بعينه
  has_image TINYINT(1) NOT NULL DEFAULT 0,      -- فيه صورة في medication_images؟ (عشان القايمة تعرف من غير JOIN)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- كل جرعة متوقعة (بيتولدوا تلقائي من medications.times)
CREATE TABLE IF NOT EXISTS doses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  medication_id INT NOT NULL,
  patient_id INT NOT NULL,
  scheduled_at DATETIME NOT NULL,
  status ENUM('pending', 'taken', 'missed') NOT NULL DEFAULT 'pending',
  snooze_until DATETIME NULL,          -- غفوة: بتأجّل الرنة من غير ما تخلي الجرعة "فايتة"
  snooze_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
  -- snooze_until مبيتصفّاش بعد الرنّة - هو "الميعاد الفعلي" اللي كل مراحل المنبه
  -- بتتحسب منه (COALESCE(snooze_until, scheduled_at))، عشان الغفوة تمدّ فترة
  -- السماح فعليًا بدل ما ترنّ وتتحسب "فاتت" في نفس الدقيقة. والعمود ده بيمنع
  -- تكرار رنّة نفس الغفوة.
  snooze_notified_at DATETIME NULL,
  taken_at DATETIME NULL,
  -- طوابع "اتبعت مرة واحدة بس" - في قاعدة البيانات مش في ذاكرة السيرفر، عشان
  -- إعادة تشغيل السيرفر (Render بينيّم الخدمة فعلاً) ما تعيدش إرسال نفس التنبيه
  due_notified_at DATETIME NULL,
  reminder_notified_at DATETIME NULL,
  escalated_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_dose (medication_id, scheduled_at),
  KEY idx_status_scheduled (status, scheduled_at),  -- الـ scheduler بيلف على دول كل دقيقة
  KEY idx_patient_scheduled (patient_id, scheduled_at),  -- تقرير الالتزام بيقرا فترة لمريض
  FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE CASCADE,
  FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- المواعيد الطبية
CREATE TABLE IF NOT EXISTS appointments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  title VARCHAR(150) NOT NULL,
  doctor_name VARCHAR(150) NULL,
  location VARCHAR(200) NULL,
  appointment_at DATETIME NOT NULL,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_appointment_at (appointment_at),  -- الـ scheduler بيقرا الجاي كل دقيقة
  FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- القياسات الصحية (ضغط / سكر / وزن / نبض / حرارة)
CREATE TABLE IF NOT EXISTS vitals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  type ENUM('blood_pressure', 'blood_sugar', 'weight', 'heart_rate', 'temperature') NOT NULL,
  value_json JSON NOT NULL,      -- مثال: {"systolic":120,"diastolic":80} أو {"value":95,"unit":"mg/dL"}
  recorded_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_patient_recorded (patient_id, recorded_at),  -- آخر 100 قراءة لمريض
  FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- الإشعارات (جرعة وصل ميعادها، جرعة فاتت، موعد قرب، بلاغ مشكلة، تصعيد)
CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,          -- المستلم (مريض أو متابع)
  patient_id INT NOT NULL,       -- بخصوص أي مريض
  type ENUM(
    'missed_dose',
    'upcoming_appointment',
    'general',
    'patient_issue',
    'dose_due',                  -- ميعاد الجرعة وصل دلوقتي (للمريض)
    'dose_reminder',             -- تذكير تاني أقوى بعد ما الأول عدى بدون تفاعل
    'dose_escalation'            -- الجرعة فاتت والمريض ما تفاعلش خالص - تنبيه للمتابع
  ) NOT NULL,
  -- الأولوية بتحدد الشكل البصري، وهل الإشعار بيخترق ساعات الهدوء ولا لأ.
  -- critical عمره ما بيتأجل - ده الفرق بين "مفكّرة" و"شبكة أمان".
  priority ENUM('critical','normal','info') NOT NULL DEFAULT 'normal',
  related_id INT NULL,           -- id الجرعة أو الموعد المرتبط
  -- مفتاح منع التكرار: INSERT IGNORE + UNIQUE بيمنع تكرار نفس الإشعار ذرّيًا.
  -- قبل كده كان SELECT-ثم-INSERT، وده فيه سباق حقيقي (دورتين scheduler
  -- متداخلتين كانوا ممكن يدخّلوا نفس الإشعار مرتين).
  dedupe_key VARCHAR(120) NULL,
  message VARCHAR(255) NOT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  -- "اتعامل معاه" غير "اتقرا": المتابع شاف البلاغ ≠ المتابع اتصرف
  handled_at DATETIME NULL,
  -- سجل التوصيل: من غيره مفيش طريقة تعرف إن الـ push بيفشل بصمت
  push_sent_at DATETIME NULL,
  delivered_at DATETIME NULL,
  clicked_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_dedupe (user_id, dedupe_key),
  KEY idx_user_created (user_id, id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- صورة الدوا - جدول منفصل عن medications عن قصد: استعلامات قايمة الأدوية
-- بتستخدم SELECT * وبتتنادى كل ما الشاشة تتفتح، فعمود صورة كان هيتشحن مع كل
-- طلب من غير داعي. كبار السن بيعرفوا الدوا بشكله مش باسمه العلمي.
CREATE TABLE IF NOT EXISTS medication_images (
  medication_id INT PRIMARY KEY,
  mime VARCHAR(40) NOT NULL,
  data MEDIUMTEXT NOT NULL,        -- base64 من غير بادئة data:
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- اشتراكات الـ Web Push: كل صف = متصفح واحد على جهاز واحد وافق يستقبل إشعارات.
-- ده اللي بيخلي التذكير يوصل والتطبيق مقفول - من غير الجدول ده التنبيه بيموت
-- بمجرد ما المستخدم يقفل التاب.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  endpoint VARCHAR(500) NOT NULL,   -- عنوان خدمة الدفع بتاعة المتصفح، فريد عالميًا
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

-- تفضيلات الإشعارات - على السيرفر مش على الجهاز، عشان تتبع الحساب مش المتصفح
CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id INT PRIMARY KEY,
  push_enabled TINYINT(1) NOT NULL DEFAULT 1,
  quiet_start TIME NULL,           -- ساعات الهدوء بتأجّل العادي بس، مش الحرج
  quiet_end TIME NULL,
  pref_dose_due TINYINT(1) NOT NULL DEFAULT 1,
  pref_missed_dose TINYINT(1) NOT NULL DEFAULT 1,
  pref_appointment TINYINT(1) NOT NULL DEFAULT 1,
  pref_patient_issue TINYINT(1) NOT NULL DEFAULT 1,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
