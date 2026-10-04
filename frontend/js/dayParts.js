/* ============================================
   MA3ak (معاك) - فترات اليوم (بدون JSX/React عمدًا)
   منطق بحت بلا واجهة، عشان يشتغل في المتصفح (JavaScript عادي) وفي Node وقت
   التيست (require) في نفس الوقت من غير أي تعديل - زي doseLogic.js بالظبط.

   ليه فترات اليوم أصلًا؟
   علبة الأقراص الأسبوعية اللي في كل بيت فيه كبير سن مقسومة خانات: صبح، ضهر،
   مسا، نوم. كبير السن مش بيحسب "الساعة ٨" - هو بيعرف "ده دوا الصبح". فكل جرعة
   في التطبيق بتاخد فترة (لون + أيقونة + كلمة)، والواجهة بتعرضها قبل الساعة نفسها.

   الساعة هنا هي "الساعة المكتوبة" في scheduled_at (توقيت مصر خام، من غير أي
   تحويل) - زي ما بيتعرض للمستخدم بالظبط. محتاجين ساعة الجهاز الحالية بس في
   حاجتين: التحية، والفترة الحالية، وبنقراها بتوقيت مصر (cairoHourOf).
   ============================================ */

// أسماء الأيقونات من js/icons.jsx. الكلمات بالعامية المصرية عمدًا - زي باقي التطبيق.
const DAY_PARTS = {
  morning: { key: 'morning', label: 'الصبح', icon: 'sunrise' },
  noon: { key: 'noon', label: 'الضهر', icon: 'sun' },
  evening: { key: 'evening', label: 'المسا', icon: 'sunset' },
  night: { key: 'night', label: 'الليل', icon: 'moon' },
};

// بداية كل فترة بالساعة (نظام 24). الليل بيبدأ 22 وبيكمّل لحد الفجر قبل الصبح.
const MORNING_FROM = 5;
const NOON_FROM = 12;
const EVENING_FROM = 17;
const NIGHT_FROM = 22;

function dayPartKeyOfHour(hour) {
  const h = Number(hour);
  if (h >= NIGHT_FROM || h < MORNING_FROM) return 'night';
  if (h >= EVENING_FROM) return 'evening';
  if (h >= NOON_FROM) return 'noon';
  return 'morning';
}

/* بيطلّع الساعة من أي صيغة بيستخدمها التطبيق: "HH:MM" (ميعاد في فورم الدواء)،
   أو "YYYY-MM-DD HH:MM:SS" / "YYYY-MM-DDTHH:MM" (scheduled_at). */
function hourOfTimeString(value) {
  const match = String(value == null ? '' : value).match(/(?:^|[ T])(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) : null;
}

// الفترة اللي الميعاد ده واقع فيها. لو الصيغة مش مفهومة بنرجّع الصبح بدل ما نكسر الشاشة.
function dayPartOfTime(value) {
  const hour = hourOfTimeString(value);
  return DAY_PARTS[hour === null ? 'morning' : dayPartKeyOfHour(hour)];
}

// الساعة دلوقتي بتوقيت مصر (0-23)، مهما كان توقيت الجهاز
function cairoHourOf(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date || new Date());
  const hour = Number(parts.find((p) => p.type === 'hour').value);
  return hour === 24 ? 0 : hour; // بعض البيئات بترجع 24 بدل 00 مع hour12:false
}

/* التحية بتتغيّر مع الوقت. "صباح الخير" لحد الضهر، "مساء الخير" لحد 10 بالليل،
   وبعدها "أهلاً" بس - مفيش تحية مصرية بتتقال بعد 10 بالليل غير الوداع. */
function greetingOfHour(hour) {
  const h = Number(hour);
  if (h >= MORNING_FROM && h < NOON_FROM) return 'صباح الخير';
  if (h >= NOON_FROM && h < NIGHT_FROM) return 'مساء الخير';
  return 'أهلاً';
}

/* أجزاء "نتيجة الحيط": اليوم والشهر واليوم بالاسم، كلهم بالأرقام والأسماء المصرية
   وبالتقويم الميلادي وبتوقيت مصر. الأرقام الهندية (٤) مضبوطة صراحة (nu-arab):
   المتصفحات مش كلها بتختارها لوحدها لـ ar-EG. التقويم الهجري مقصود إنه مش هنا:
   الشهور الهجرية في مصر بتتحدد برؤية الهلال، وأي حساب فلكي ممكن يغلط يوم - وفي
   تطبيق بيكتب التاريخ لكبير السن، يوم غلط أسوأ من مفيش يوم. */
function leafParts(date) {
  const when = date || new Date();
  const format = (options) =>
    new Intl.DateTimeFormat('ar-EG-u-ca-gregory-nu-arab', { timeZone: 'Africa/Cairo', ...options }).format(when);

  let weekday = format({ weekday: 'long' });
  // "الاثنين" فصحى؛ الباقي مكتوب بنفس شكله في الكلام ("الإتنين" زي ما هو في فورم الأدوية)
  if (weekday === 'الاثنين' || weekday === 'الإثنين') weekday = 'الإتنين';

  return {
    day: format({ day: 'numeric' }),
    month: format({ month: 'long' }),
    year: format({ year: 'numeric' }),
    weekday,
  };
}

// UMD بسيط: في المتصفح الدوال بتبقى global عادي، وفي Node (تيست) بتتصدّر.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DAY_PARTS,
    dayPartKeyOfHour,
    hourOfTimeString,
    dayPartOfTime,
    cairoHourOf,
    greetingOfHour,
    leafParts,
  };
}
