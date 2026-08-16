/* ============================================
   MA3ak (معاك) - توحيد التعامل مع "دلوقتي" على توقيت مصر (Africa/Cairo)

   المشكلة: السيرفر (Render) وقاعدة البيانات (مستضافة على Railway، مضيف منفصل
   تمامًا) كل واحد فيهم شغال بتوقيته الخاص - غالبًا UTC، مش بالضرورة توقيت مصر.
   كل عمود *_at في قاعدة البيانات نص DATETIME خام من غير timezone، والمفروض
   يتقرا/يتكتب دايمًا كـ"توقيت مصر" - مش توقيت أي سيرفر. لو اعتمدنا على
   NOW()/CURDATE() بتوع MySQL (بترجع بتوقيت مضيف قاعدة البيانات) كان ده اللي
   بيخلي حالة الجرعة (متاحة/لسه بدري/فاتت) تتحسب بالنسبة لساعة تانية تمامًا عن
   الساعة الحقيقية عند المستخدم.

   مصر رجّعت التوقيت الصيفي من 2023 (+3 صيفًا / +2 شتاءً) - عشان كده بنستخدم
   Intl.DateTimeFormat بمنطقة "Africa/Cairo" بدل رقم offset ثابت.
   ============================================ */

const CAIRO_TZ = 'Africa/Cairo';

function pad(n) {
  return String(n).padStart(2, '0');
}

function cairoPartsAt(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CAIRO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  let hour = get('hour');
  if (hour === 24) hour = 0; // بعض البيئات بترجع 24 بدل 00 مع hour12:false
  return { year: get('year'), month: get('month'), day: get('day'), hour, minute: get('minute'), second: get('second') };
}

// "YYYY-MM-DD HH:MM:SS" - دلوقتي فعليًا بتوقيت مصر، جاهز للتخزين/المقارنة المباشر
// في أعمدة DATETIME، مهما كان توقيت السيرفر اللي الكود شغال عليه فعليًا
function cairoNowString() {
  const p = cairoPartsAt(new Date());
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

// "YYYY-MM-DD" - "النهاردة" الحقيقي بتوقيت مصر (بديل CURDATE() اللي بيرجع
// تاريخ مضيف قاعدة البيانات، ممكن يكون لسه على "إمبارح" أو "بكرة" بالفعل)
function cairoToday() {
  return cairoNowString().slice(0, 10);
}

// "YYYY-MM-DD HH:MM:SS" لساعة "HH:MM" بعد عدد أيام معيّن من النهاردة (بتوقيت
// مصر) - مستخدمة لتوليد جرعات اليوم وبكرة بغض النظر عن توقيت السيرفر
function cairoDateWithOffset(daysOffset, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const p = cairoPartsAt(new Date());
  // بنتعامل مع الأرقام كـ"تقويم مدني" (سنة/شهر/يوم) مصري بحت - إضافة الأيام هنا
  // عملية تقويمية عادية، مش تحويل توقيت، فمفيش داعي نقلق بشأن DST هنا تحديدًا
  const civil = new Date(Date.UTC(p.year, p.month - 1, p.day + daysOffset, h, m, 0));
  return `${civil.getUTCFullYear()}-${pad(civil.getUTCMonth() + 1)}-${pad(civil.getUTCDate())} ${pad(
    civil.getUTCHours()
  )}:${pad(civil.getUTCMinutes())}:00`;
}

// "YYYY-MM-DD HH:MM:SS" لدلوقتي مطروح منه/مضاف عليه عدد دقايق - بديل
// DATE_SUB(NOW(), INTERVAL ? MINUTE) / DATE_ADD(NOW(), INTERVAL ? HOUR) بتوع
// MySQL (اللي بترجع بتوقيت مضيف قاعدة البيانات)
function cairoNowPlusMinutes(minutesOffset) {
  const p = cairoPartsAt(new Date());
  const civil = new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute + minutesOffset, p.second));
  return `${civil.getUTCFullYear()}-${pad(civil.getUTCMonth() + 1)}-${pad(civil.getUTCDate())} ${pad(
    civil.getUTCHours()
  )}:${pad(civil.getUTCMinutes())}:${pad(civil.getUTCSeconds())}`;
}

module.exports = { CAIRO_TZ, cairoNowString, cairoToday, cairoDateWithOffset, cairoNowPlusMinutes };
