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
  start_date DATE NOT NULL,
  end_date DATE NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
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
  taken_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_dose (medication_id, scheduled_at),
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
  FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- الإشعارات (جرعة فاتت، موعد قرب، ...)
CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,          -- المستلم (مريض أو متابع)
  patient_id INT NOT NULL,       -- بخصوص أي مريض
  type ENUM('missed_dose', 'upcoming_appointment', 'general', 'patient_issue') NOT NULL,
  related_id INT NULL,           -- id الجرعة أو الموعد المرتبط (لمنع تكرار الإشعار)
  message VARCHAR(255) NOT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
