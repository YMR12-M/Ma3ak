/* ============================================
   MA3ak (معاك) - نظام الأيقونات
   كل أيقونة في التطبيق SVG مرسوم بالمسارات (paths)، مش إيموجي.

   ليه؟ الإيموجي بيترسم كصورة نقطية جاهزة جوه الخط بتاع نظام التشغيل:
   1. شكله بيختلف تمامًا من أندرويد لآيفون لويندوز - يعني هويتنا البصرية
      مش في إيدنا أصلًا.
   2. بيتبهدل على الشاشات عالية الدقة لأنه صورة بحجم ثابت، بينما الـ SVG
      بيتحسب من جديد مع كل مقاس/دقة - حاد 100% على أي شاشة.
   3. مش بياخد لون العنصر، فمش بيتماشى مع الوضع الداكن ولا مع حالة الزرار.

   القواعد اللي كل أيقونة هنا ماشية عليها:
   - مربع 24×24 لكل الأيقونات، عشان أي اتنين جنب بعض يبانوا بنفس الوزن البصري.
   - خطوط بس (stroke) بلون currentColor - يعني بتاخد لون النص اللي حواليها
     أوتوماتيك، في الفاتح وفي الداكن، وفي حالة hover كمان.
   - نهايات وزوايا مدوّرة (round) - بتمشي مع الحواف المدوّرة في باقي التصميم.
   - سُمك 1.9px افتراضي (أوضح من 1.5 المعتاد، لأن جمهورنا كبار السن).
   ============================================ */

const ICON_PATHS = {
  /* ---------- الهوية ---------- */

  // شعار معاك: قلب + خط نبض جواه (رعاية + متابعة صحية)
  brand: (
    <React.Fragment>
      <path d="M12 20.8 4.4 13.3a5 5 0 1 1 7.6-6.4 5 5 0 1 1 7.6 6.4Z" />
      <path d="M4.6 12.4h3.1l1.6-3 2.2 5.6 1.7-3.3 1 .7h5.2" />
    </React.Fragment>
  ),

  /* ---------- التنقّل ---------- */

  home: (
    <React.Fragment>
      <path d="M3.6 10.4 12 3.5l8.4 6.9V19.6a1.8 1.8 0 0 1-1.8 1.8H5.4a1.8 1.8 0 0 1-1.8-1.8Z" />
      <path d="M9.4 21.4v-6.6h5.2v6.6" />
    </React.Fragment>
  ),

  pill: (
    <React.Fragment>
      <rect x="1.9" y="8.4" width="20.2" height="7.2" rx="3.6" transform="rotate(-45 12 12)" />
      <path d="M9.5 9.5 14.5 14.5" />
    </React.Fragment>
  ),

  calendar: (
    <React.Fragment>
      <rect x="3.2" y="5" width="17.6" height="16" rx="3.2" />
      <path d="M3.2 10.2h17.6M8.2 2.8v4.2M15.8 2.8v4.2" />
      <circle cx="8.4" cy="14.4" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="12" cy="14.4" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="15.6" cy="14.4" r="1.15" fill="currentColor" stroke="none" />
    </React.Fragment>
  ),

  stethoscope: (
    <React.Fragment>
      <path d="M6.6 3.4v5.5a4.6 4.6 0 0 0 9.2 0V3.4" />
      <path d="M4.9 3.4h3.1M14.4 3.4h3.1" />
      <path d="M11.2 13.5v2.2a4.6 4.6 0 0 0 9.2 0v-1.3" />
      <circle cx="20.4" cy="11.7" r="2.4" />
    </React.Fragment>
  ),

  bell: (
    <React.Fragment>
      <path d="M18.2 8.6a6.2 6.2 0 1 0-12.4 0c0 5.3-2.1 6.6-2.1 6.6h16.6s-2.1-1.3-2.1-6.6Z" />
      <path d="M13.9 19a2.2 2.2 0 0 1-3.8 0" />
    </React.Fragment>
  ),

  bellOff: (
    <React.Fragment>
      <path d="M17.6 8.6a6.2 6.2 0 0 0-9.4-4.1M5.9 8.9c0 4.9-2.2 6.3-2.2 6.3h13.4" />
      <path d="M13.9 19a2.2 2.2 0 0 1-3.8 0" />
      <path d="M3.4 3.4 20.6 20.6" />
    </React.Fragment>
  ),

  users: (
    <React.Fragment>
      <circle cx="9.2" cy="8.2" r="3.7" />
      <path d="M2.8 20.2a6.4 6.4 0 0 1 12.8 0" />
      <path d="M16.6 5.1a3.7 3.7 0 0 1 0 6.6M18.2 14.6a6.4 6.4 0 0 1 3 5.6" />
    </React.Fragment>
  ),

  user: (
    <React.Fragment>
      <circle cx="12" cy="8" r="4.1" />
      <path d="M4.4 20.6a7.6 7.6 0 0 1 15.2 0" />
    </React.Fragment>
  ),

  /* ---------- إجراءات ---------- */

  settings: (
    <React.Fragment>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" />
      <circle cx="12" cy="12" r="3" />
    </React.Fragment>
  ),

  // السهم بيخرج ناحية الشمال - في واجهة عربية (RTL) الخروج بيتقرا للشمال
  logout: (
    <React.Fragment>
      <path d="M14.8 20.6h3.4a2 2 0 0 0 2-2V5.4a2 2 0 0 0-2-2h-3.4" />
      <path d="M8.4 7.8 4.2 12l4.2 4.2" />
      <path d="M4.2 12h10.6" />
    </React.Fragment>
  ),

  plus: <path d="M12 4.8v14.4M4.8 12h14.4" />,

  trash: (
    <React.Fragment>
      <path d="M3.8 6.4h16.4" />
      <path d="M9.2 6.4V4.9a1.4 1.4 0 0 1 1.4-1.4h2.8a1.4 1.4 0 0 1 1.4 1.4v1.5" />
      <path d="M6.2 6.4l.85 12.9a1.7 1.7 0 0 0 1.7 1.6h6.5a1.7 1.7 0 0 0 1.7-1.6l.85-12.9" />
      <path d="M10.2 10.6v6.2M13.8 10.6v6.2" />
    </React.Fragment>
  ),

  link: (
    <React.Fragment>
      <path d="M10.2 13.8a4.5 4.5 0 0 0 6.8.5l2.4-2.4a4.5 4.5 0 0 0-6.4-6.4l-1.4 1.4" />
      <path d="M13.8 10.2a4.5 4.5 0 0 0-6.8-.5L4.6 12.1a4.5 4.5 0 0 0 6.4 6.4l1.4-1.4" />
    </React.Fragment>
  ),

  refresh: (
    <React.Fragment>
      <path d="M20.6 12a8.6 8.6 0 1 1-2.5-6.1" />
      <path d="M20.6 3.6v5.7h-5.7" />
    </React.Fragment>
  ),

  copy: (
    <React.Fragment>
      <rect x="8.8" y="8.8" width="12.4" height="12.4" rx="2.6" />
      <path d="M5.6 15.2H4.8a2 2 0 0 1-2-2V4.8a2 2 0 0 1 2-2h8.4a2 2 0 0 1 2 2v.8" />
    </React.Fragment>
  ),

  speaker: (
    <React.Fragment>
      <path d="M11.4 4.6 6.8 8.4H3.9a1.2 1.2 0 0 0-1.2 1.2v4.8a1.2 1.2 0 0 0 1.2 1.2h2.9l4.6 3.8a.9.9 0 0 0 1.5-.7V5.3a.9.9 0 0 0-1.5-.7Z" />
      <path d="M16.4 9.2a4 4 0 0 1 0 5.6M19.2 6.4a8 8 0 0 1 0 11.2" />
    </React.Fragment>
  ),

  share: (
    <React.Fragment>
      <path d="M12 15.4V3.4" />
      <path d="M8.4 7 12 3.4 15.6 7" />
      <path d="M5.6 13.2v5.8a2 2 0 0 0 2 2h8.8a2 2 0 0 0 2-2v-5.8" />
    </React.Fragment>
  ),

  install: (
    <React.Fragment>
      <rect x="5.6" y="2.6" width="12.8" height="18.8" rx="3" />
      <path d="M12 7.4v6.4M9.4 11.2 12 13.8l2.6-2.6" />
      <path d="M10.3 18.4h3.4" />
    </React.Fragment>
  ),

  // إغلاق النوافذ. قبل كده كان الرمز النصي × - وده حرف بيترسم من الخط نفسه،
  // يعني سُمكه وميلانه بيختلفوا من جهاز للتاني ومبياخدش سُمك الخط بتاع باقي
  // الأيقونات، فكان بيبان أرفع وأصغر من كل حاجة حواليه.
  close: <path d="M6.4 6.4 17.6 17.6M17.6 6.4 6.4 17.6" />,

  /* سهم لأسفل - بيتلف 180 درجة بالـ CSS لما المجموعة تتفتح
     (شوف .notif-group-chevron في css/screens.css) */
  chevron: <path d="M6 9.5 12 15.5 18 9.5" />,

  /* ---------- الحالات ---------- */

  check: <path d="M4.6 12.6 9.6 17.6 19.4 6.8" />,

  checkCircle: (
    <React.Fragment>
      <circle cx="12" cy="12" r="8.8" />
      <path d="M8.1 12.3 10.9 15.1 16.2 9.2" />
    </React.Fragment>
  ),

  alert: (
    <React.Fragment>
      <circle cx="12" cy="12" r="8.8" />
      <path d="M12 7.2v5.6" />
      <circle cx="12" cy="16.4" r="1.15" fill="currentColor" stroke="none" />
    </React.Fragment>
  ),

  warning: (
    <React.Fragment>
      <path d="M10.3 3.9 2.7 17.1a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9.2v4.2" />
      <circle cx="12" cy="16.7" r="1.1" fill="currentColor" stroke="none" />
    </React.Fragment>
  ),

  clock: (
    <React.Fragment>
      <circle cx="12" cy="12" r="8.8" />
      <path d="M12 6.9V12l3.5 2.1" />
    </React.Fragment>
  ),

  question: (
    <React.Fragment>
      <circle cx="12" cy="12" r="8.8" />
      <path d="M9.4 9.3a2.7 2.7 0 0 1 5.3.7c0 1.8-2.7 2.7-2.7 4" />
      <circle cx="12" cy="17" r="1.1" fill="currentColor" stroke="none" />
    </React.Fragment>
  ),

  unwell: (
    <React.Fragment>
      <circle cx="12" cy="12" r="8.8" />
      <path d="M8.5 15.8c.9-1.1 2.1-1.7 3.5-1.7s2.6.6 3.5 1.7" />
      <path d="M8 9.1l2.6 1.3M16 9.1l-2.6 1.3" />
    </React.Fragment>
  ),

  phone: (
    <path d="M21.4 16.9v2.9a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 1.5 4.1 2 2 0 0 1 3.5 1.9h2.9a2 2 0 0 1 2 1.7 12.7 12.7 0 0 0 .7 2.8 2 2 0 0 1-.5 2.1L7.4 9.8a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5 12.7 12.7 0 0 0 2.8.7 2 2 0 0 1 1.8 2.1Z" />
  ),

  inbox: (
    <React.Fragment>
      <path d="M5.7 5.2 2.9 12.4v4.6a2.2 2.2 0 0 0 2.2 2.2h13.8a2.2 2.2 0 0 0 2.2-2.2v-4.6l-2.8-7.2a2.2 2.2 0 0 0-2-1.4H7.7a2.2 2.2 0 0 0-2 1.4Z" />
      <path d="M2.9 12.4h4.5l1.4 2.6h6.4l1.4-2.6h4.5" />
    </React.Fragment>
  ),

  sparkles: (
    <React.Fragment>
      <path d="M12 3.4 13.9 8.5 19 10.4 13.9 12.3 12 17.4 10.1 12.3 5 10.4 10.1 8.5Z" />
      <path d="M18.9 15.6v3M20.4 17.1h-3M5.4 3.6v2.8M6.8 5h-2.8" />
    </React.Fragment>
  ),

  lock: (
    <React.Fragment>
      <rect x="4.6" y="10.3" width="14.8" height="10.8" rx="2.6" />
      <path d="M8 10.3V7.2a4 4 0 0 1 8 0v3.1" />
    </React.Fragment>
  ),

  /* ---------- القياسات الصحية ---------- */

  pulse: <path d="M2.8 12.3h3.6l2.1-5.4 3.4 10.6 2.5-7.6 1.6 2.4h5.2" />,

  droplet: <path d="M12 2.9s6.5 6.2 6.5 10.4A6.5 6.5 0 0 1 5.5 13.3C5.5 9.1 12 2.9 12 2.9Z" />,

  scale: (
    <React.Fragment>
      <rect x="3.2" y="3.8" width="17.6" height="16.4" rx="3.4" />
      <path d="M8 14.8a4.6 4.6 0 0 1 8 0" />
      <path d="M12 14.8 14.1 10.3" />
    </React.Fragment>
  ),

  heart: <path d="M12 20.6 4.3 13a4.9 4.9 0 0 1 7.7-6.1 4.9 4.9 0 0 1 7.7 6.1Z" />,

  thermometer: (
    <React.Fragment>
      <path d="M14.2 14.6V5.1a2.2 2.2 0 0 0-4.4 0v9.5a4.3 4.3 0 1 0 4.4 0Z" />
      <circle cx="12" cy="17.6" r="1.5" fill="currentColor" stroke="none" />
    </React.Fragment>
  ),

  /* ---------- الإعدادات ---------- */

  sun: (
    <React.Fragment>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6" />
    </React.Fragment>
  ),

  moon: <path d="M20.6 14.7A8.7 8.7 0 0 1 9.3 3.4 8.9 8.9 0 1 0 20.6 14.7Z" />,

  textSize: (
    <React.Fragment>
      <path d="M2.6 19.4 7.6 5.6l5 13.8M4.4 15.2h6.4" />
      <path d="M14.2 19.4 17.6 10.6 21 19.4M15.4 16.2h4.4" />
    </React.Fragment>
  ),

  speech: <path d="M21 11.7a8.4 8.4 0 0 1-12.1 7.5L3.4 20.6l1.4-5.2A8.4 8.4 0 1 1 21 11.7Z" />,
};

/* المكوّن نفسه.
   - size: المقاس بالبيكسل (مربع). القيمة الافتراضية 24.
   - القياسات بتتبعت كخصائص width/height على الـ <svg> مش من CSS، عشان الأيقونة
     تحجز مساحتها من أول رسم فالصفحة متنطّش وهي بتحمّل.
   - aria-hidden دايمًا: الأيقونة زينة بصرية، والمعنى موجود في النص اللي جنبها
     أو في aria-label بتاع الزرار. لو الأيقونة لوحدها جوه زرار، الزرار لازم
     يكون عليه aria-label. */
function Icon({ name, size = 24, className = '', strokeWidth = 1.9, style }) {
  const paths = ICON_PATHS[name];
  if (!paths) return null;
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={style}
    >
      {paths}
    </svg>
  );
}
