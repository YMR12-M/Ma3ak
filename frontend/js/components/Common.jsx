/* ============================================
   MA3ak (معاك) - Common / reusable UI components
   ============================================ */

// loading بيقفل الزرار ويوري دايرة صغيرة بتلف جواه - المستخدم يعرف إن دوسته
// وصلت وإن فيه حاجة بتحصل، بدل ما يفضل يدوس تاني وتالت على زرار شكله ساكن.
// بنفصل loading عن باقي الـ props عمدًا عشان ميتسربش كـ attribute على <button>.
function Button({ children, variant = 'primary', loading = false, disabled = false, ...props }) {
  return (
    <button
      className={`btn btn-${variant}${loading ? ' is-loading' : ''}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <span className="btn-spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

function Card({ children, className = '' }) {
  return <div className={`card ${className}`}>{children}</div>;
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

function Spinner() {
  return <div className="spinner" role="status" aria-label="جاري التحميل" />;
}

// بديل الـ Spinner في الشاشات اللي بتعرض قايمة كروت: بيرسم هيكل الكروت نفسها
// وهي بتحمّل، فالصفحة مبتنطش لما البيانات توصل - الشكل هو هو، بس اتملى.
// aria-hidden لأن الحالة نفسها معلَنة لقارئ الشاشة من الـ role="status" اللي فوق.
function SkeletonCards({ count = 3 }) {
  return (
    <div className="skeleton-list" role="status" aria-label="جاري التحميل">
      {Array.from({ length: count }).map((_, i) => (
        <div className="skeleton-card" key={i} aria-hidden="true">
          <div className="skeleton skeleton-avatar" />
          <div className="skeleton-card-body">
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line" />
          </div>
        </div>
      ))}
    </div>
  );
}

// icon هنا اسم أيقونة من js/icons.jsx (مش إيموجي) - الأسماء المتاحة كلها
// معرّفة في ICON_PATHS هناك.
function EmptyState({ icon = 'inbox', text }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon name={icon} size={46} strokeWidth={1.6} />
      </div>
      <p>{text}</p>
    </div>
  );
}

// role="alert" بيخلي قارئ الشاشة يعلن الرسالة فورًا لحظة ما تظهر، من غير ما المستخدم
// يحتاج يدور عليها بنفسه - مهم جدًا هنا لأن الـ Banner ده بيستخدم لكل رسائل الخطأ
// في كل شاشات التطبيق (المريض والمتابع).
function Banner({ type = 'error', children, onClose }) {
  if (!children) return null;
  return (
    <div className={`banner banner-${type}`} role="alert" aria-live={type === 'error' ? 'assertive' : 'polite'}>
      <span>{children}</span>
      {onClose && (
        <button className="banner-close" onClick={onClose} aria-label="إغلاق">
          ×
        </button>
      )}
    </div>
  );
}

let modalTitleSeq = 0;

// role="dialog" + aria-modal بيقولوا لقارئ الشاشة إن الصفحة اللي وراه معطّلة مؤقتًا،
// وaria-labelledby بيربط النافذة بعنوانها عشان تتقري لحظة ما تفتح. التركيز بيروح
// لزرار الإغلاق أول ما النافذة تفتح عشان مستخدم الكيبورد ميضيعش جوه الصفحة اللي وراها.
function Modal({ title, onClose, children }) {
  const titleId = React.useRef(`modal-title-${modalTitleSeq++}`).current;
  const closeRef = React.useRef(null);

  // onClose غالبًا بيتبعت كدالة سهمية جديدة مع كل رندر، فبنمسكها في ref
  // ونخلي الـ effect يشتغل مرة واحدة بس عند الفتح. من غير كده كان ممكن الـ
  // effect يعيد نفسه مع أي رندر ويخطف التركيز من الحقل اللي المستخدم بيكتب فيه.
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  React.useEffect(() => {
    closeRef.current && closeRef.current.focus();

    // Escape بيقفل النافذة - سلوك متوقع من أي حد بيستخدم كيبورد، وكان ناقص.
    function onKeyDown(e) {
      if (e.key === 'Escape') onCloseRef.current();
    }
    document.addEventListener('keydown', onKeyDown);

    // منع سكرول الصفحة اللي ورا النافذة وهي مفتوحة - من غير كده الموبايل
    // بيسكرول الصفحة اللي تحت لما السكرول جوه النافذة يخلص.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 id={titleId}>{title}</h3>
          <button ref={closeRef} className="modal-close" onClick={onClose} aria-label="إغلاق">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function formatTime(dateStr) {
  const d = new Date(String(dateStr).replace(' ', 'T'));
  return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(dateStr) {
  const d = new Date(String(dateStr).replace(' ', 'T'));
  return d.toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
}

// بيحوّل قيمة Date لصيغة datetime-local اللي بيفهمها input[type=datetime-local]
function toDatetimeLocalValue(dateStr) {
  const d = dateStr ? new Date(String(dateStr).replace(' ', 'T')) : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

function isStandaloneDisplay() {
  return (
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    window.navigator.standalone === true // iOS القديمة بتحط العلامة دي على navigator مباشرة
  );
}

function isIOSDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

// بانر "ثبّت التطبيق" - ده الرسالة اللي بتظهر من الموقع نفسه إنه ممكن ينزل على الشاشة
// الرئيسية زي أي تطبيق، من غير متجر تطبيقات. اتنين حالة مختلفين تمامًا حسب المتصفح:
//   - أندرويد/كروم/إيدج: فيه API حقيقي (beforeinstallprompt) بيدّينا زرار "تثبيت" فعلي
//     شغال - App.jsx بيلقط الـ event ده ويبعته هنا كـ deferredPrompt.
//   - iOS/Safari: **مفيش API زي كده خالص** (قرار من آبل، مش قصور فينا) - أقصى حاجة نقدر
//     نعملها إرشاد يدوي (مشاركة ← إضافة للشاشة الرئيسية). مفيش زرار "تثبيت" تلقائي ممكن.
function InstallBanner({ deferredPrompt, onInstalled }) {
  const [dismissed, setDismissed] = React.useState(() => {
    const at = Number(localStorage.getItem('ma3ak_install_dismissed_at') || 0);
    return Boolean(at) && Date.now() - at < 14 * 24 * 60 * 60 * 1000; // متتكررش قبل أسبوعين من آخر تجاهل
  });

  if (dismissed || isStandaloneDisplay()) return null;
  const ios = isIOSDevice();
  if (!deferredPrompt && !ios) return null; // مفيش وسيلة تثبيت متاحة في المتصفح ده أصلاً

  function dismiss() {
    localStorage.setItem('ma3ak_install_dismissed_at', String(Date.now()));
    setDismissed(true);
  }

  async function install() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try {
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted' && onInstalled) onInstalled();
    } catch (e) {
      /* المستخدم قفل نافذة التثبيت - مش خطأ يستاهل اهتمام */
    }
    dismiss();
  }

  return (
    <div className="install-banner">
      <span className="install-banner-icon" aria-hidden="true">
        <Icon name="install" size={28} />
      </span>
      <div className="install-banner-body">
        <div className="install-banner-title">ثبّت معاك على شاشتك الرئيسية</div>
        <div className="install-banner-desc">
          {ios
            ? 'دوس على زرار المشاركة تحت في Safari، بعدين "إضافة إلى الشاشة الرئيسية"'
            : 'تفتحه بضغطة واحدة زي أي تطبيق تاني، من غير ما تدور عليه في المتصفح'}
        </div>
      </div>
      {!ios && (
        <button className="install-banner-btn" onClick={install}>
          تثبيت
        </button>
      )}
      <button className="install-banner-close" onClick={dismiss} aria-label="إغلاق">
        ×
      </button>
    </div>
  );
}

// نسخ نص للحافظة. navigator.clipboard بيتمنع في أي صفحة مش https أو localhost
// (زي فتح التطبيق من IP الشبكة المحلية على الموبايل)، فبنرجع لطريقة execCommand القديمة كـ fallback.
async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      /* هنجرب الـ fallback تحت */
    }
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    return false;
  }
}
