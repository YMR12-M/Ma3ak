-- ============================================
-- MA3ak (معاك) - Migration 3
-- نوع إشعار جديد: "المريض بلّغ عن مشكلة" (زرار "حصلت مشكلة؟" في صفحة المريض)
-- ============================================

USE ma3ak;

ALTER TABLE notifications
  MODIFY type ENUM('missed_dose', 'upcoming_appointment', 'general', 'patient_issue') NOT NULL;
