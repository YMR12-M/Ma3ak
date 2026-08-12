-- ============================================
-- MA3ak (معاك) - Migration 2
-- الإيميل بقى اختياري (والموبايل هو المعرّف الأساسي)
-- + نظام "لينك دخول" للمريض (بدون باسورد، المتابع هو اللي بيضيفه)
-- ============================================

USE ma3ak;

-- الإيميل بقى اختياري، وكلمة المرور اختيارية (المريض المُضاف من المتابع مالوش باسورد أصلاً)
ALTER TABLE users
  MODIFY email VARCHAR(190) NULL,
  MODIFY password_hash VARCHAR(255) NULL;

-- الموبايل بقى هو المعرّف الأساسي لتسجيل الدخول، لازم يكون فريد
ALTER TABLE users
  ADD UNIQUE KEY uniq_phone (phone);

-- توكن سري طويل بيتحط جوه لينك دخول المريض (بديل الباسورد بالكامل)
ALTER TABLE users
  ADD COLUMN access_token VARCHAR(64) NULL UNIQUE AFTER link_code;
