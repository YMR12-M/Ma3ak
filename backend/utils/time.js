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

// "HH:MM" - الساعة دلوقتي بتوقيت مصر بنظام 24 ساعة. بتستخدم في مقارنة
// "ساعات الهدوء" (notification_prefs.quiet_start/quiet_end) - المقارنة لازم
// تكون بساعة المستخدم الحقيقية، مش ساعة السيرفر.
function cairoClockNow() {
  return cairoNowString().slice(11, 16);
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

/* رقم اليوم في الأسبوع لتاريخ "YYYY-MM-DD" (0 = الأحد ... 6 = السبت).

   بيستخدم في جدولة الأدوية الأسبوعية (medications.days_of_week كقناع 7 بت).
   بنحسبه من النص نفسه بـ Date.UTC مش من new Date(str) العادية: التانية بتفسّر
   النص بتوقيت الجهاز، وده كان ممكن يزحلق اليوم يوم كامل لقدام أو لورا على
   سيرفر شغال UTC - يعني جرعة الجمعة تتولّد يوم الخميس. */
function dayOfWeekIndex(dateString) {
  const [y, m, d] = String(dateString).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/* هل اليوم ده مفعّل في قناع أيام الأسبوع؟
   القناع TINYINT: بت 0 = الأحد ... بت 6 = السبت، و127 = كل الأيام.
   أي قيمة فاضية/صفر بتتعامل كـ"كل الأيام" - دواء من غير أي يوم مفعّل مالوش
   معنى، والافتراض الآمن إنه يتولّد مش إنه يختفي في صمت. */
function isDayEnabled(daysMask, dateString) {
  const mask = Number(daysMask);
  if (!Number.isFinite(mask) || mask <= 0 || mask >= 127) return true;
  return (mask & (1 << dayOfWeekIndex(dateString))) !== 0;
}

/* بيحوّل "YYYY-MM-DD HH:MM:SS" لساعة بصيغة عربية مقروءة زي "8:00 م".
   القيمة المخزّنة أصلاً بتوقيت مصر، فمفيش أي تحويل مناطق زمنية هنا - بنقرا
   الساعة من النص زي ما هي. الرسايل دي بتتخزن في notifications.message وبيقراها
   كبار السن، فرقم خام زي "2026-08-16 20:00:00" وسط جملة عربية مش مقبول. */
function formatCairoClock(datetimeString) {
  const [h, m] = String(datetimeString).slice(11, 16).split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return '';
  const period = h < 12 ? 'ص' : 'م';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${pad(m)} ${period}`;
}

/* بيوصف وقت بالنسبة للنهاردة: "النهاردة الساعة 8:00 م" / "بكرة الساعة 10:00 ص"
   / "يوم 2026-09-01 الساعة 10:00 ص". قبل كده كل الإشعارات كانت بتقول "غدًا"
   حتى لو الموعد بعد ساعتين في نفس اليوم. */
function describeCairoWhen(datetimeString) {
  const datePart = String(datetimeString).slice(0, 10);
  const clock = formatCairoClock(datetimeString);
  const today = cairoToday();
  const tomorrow = cairoDateWithOffset(1, '00:00').slice(0, 10);

  if (datePart === today) return `النهاردة الساعة ${clock}`;
  if (datePart === tomorrow) return `بكرة الساعة ${clock}`;
  return `يوم ${datePart} الساعة ${clock}`;
}

module.exports = {
  CAIRO_TZ,
  cairoNowString,
  cairoClockNow,
  cairoToday,
  cairoDateWithOffset,
  cairoNowPlusMinutes,
  formatCairoClock,
  describeCairoWhen,
  dayOfWeekIndex,
  isDayEnabled,
};
