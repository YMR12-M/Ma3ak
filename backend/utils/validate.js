/* ============================================
   MA3ak (معاك) - تحقق من المدخلات قبل ما توصل لقاعدة البيانات

   ليه الملف ده موجود: قاعدة البيانات نفسها بترفض القيم الغلط (تاريخ مش تاريخ،
   نص أطول من العمود، JSON مكسور)، لكنها بترفضها كـ"خطأ سيرفر" وحش وسط عملية
   الحفظ - مش كرسالة مفهومة للمستخدم. الأنضف إننا نمسك الغلط هنا بدري ونرد
   رسالة عربية واضحة بـ400، وقاعدة البيانات تفضل خط الدفاع الأخير مش الأول.

   كل الحدود تحت مطابقة لأعمدة sql/schema.sql بالظبط - لو اتغير عمود هناك،
   لازم يتغير هنا.
   ============================================ */

// أطوال الأعمدة زي ما هي في schema.sql
const LIMITS = {
  userName: 120, // users.name VARCHAR(120)
  email: 190, // users.email VARCHAR(190)
  phone: 30, // users.phone VARCHAR(30)
  medName: 150, // medications.name VARCHAR(150)
  dosage: 100, // medications.dosage VARCHAR(100)
  apptTitle: 150, // appointments.title VARCHAR(150)
  doctorName: 150, // appointments.doctor_name VARCHAR(150)
  location: 200, // appointments.location VARCHAR(200)
  notes: 2000, // أعمدة TEXT بتستحمل أكتر بكتير، بس مفيش داعي لملاحظات أطول من كده
  password: 200, // bcrypt بيتعامل مع أول 72 بايت بس - أي حاجة أطول مالهاش معنى أمني
  maxTimesPerMed: 12, // 12 جرعة في اليوم سقف منطقي جدًا لأي دواء
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/; // "HH:MM" بنظام 24 ساعة
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}[ T]([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

// نص غير فاضي (بعد إزالة المسافات) - بيمنع اسم زي "   " إنه يعدي كأنه اسم حقيقي
function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function isTooLong(v, max) {
  return typeof v === 'string' && v.length > max;
}

// "HH:MM" صالح فعلاً - بيرفض حاجات زي "25:99" اللي كانت بتتقبل وتتحول
// لجرعة في وقت غلط تمامًا (Date بيلف الساعات الزيادة لليوم اللي بعده)
function isValidTime(v) {
  return typeof v === 'string' && TIME_RE.test(v);
}

// "YYYY-MM-DD" موجود فعلاً في التقويم - بيرفض 2026-02-30 اللي شكلها سليم بس مش موجودة
function isValidDate(v) {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// "YYYY-MM-DD HH:MM[:SS]" (أو بـ T مكان المسافة زي ما input[type=datetime-local] بيبعت)
function isValidDateTime(v) {
  return typeof v === 'string' && DATETIME_RE.test(v) && isValidDate(v.slice(0, 10));
}

// بيوحّد أي datetime صالح لصيغة واحدة تفهمها MySQL: "YYYY-MM-DD HH:MM:SS"
function normalizeDateTime(v) {
  const s = String(v).replace('T', ' ');
  return s.length === 16 ? `${s}:00` : s;
}

// مصفوفة مواعيد جرعات صالحة: مش فاضية، كلها "HH:MM" حقيقية، من غير تكرار
// بيرجع رسالة الخطأ العربية أو null لو كله تمام
function validateTimes(times) {
  if (!Array.isArray(times) || times.length === 0) {
    return 'من فضلك حدد ميعاد واحد على الأقل للجرعة';
  }
  if (times.length > LIMITS.maxTimesPerMed) {
    return `أقصى عدد جرعات في اليوم ${LIMITS.maxTimesPerMed}`;
  }
  if (!times.every(isValidTime)) {
    return 'فيه ميعاد جرعة مش مكتوب صح (لازم يكون بصيغة 24 ساعة زي 08:00)';
  }
  if (new Set(times).size !== times.length) {
    return 'فيه ميعاد جرعة مكرر أكتر من مرة';
  }
  return null;
}

module.exports = {
  LIMITS,
  isNonEmptyString,
  isTooLong,
  isValidTime,
  isValidDate,
  isValidDateTime,
  normalizeDateTime,
  validateTimes,
};
