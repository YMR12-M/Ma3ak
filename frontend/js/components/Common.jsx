/* ============================================
   MA3ak (معاك) - Common / reusable UI components
   ============================================ */

function Button({ children, variant = 'primary', ...props }) {
  return (
    <button className={`btn btn-${variant}`} {...props}>
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

function EmptyState({ icon = '📭', text }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <p>{text}</p>
    </div>
  );
}

function Banner({ type = 'error', children, onClose }) {
  if (!children) return null;
  return (
    <div className={`banner banner-${type}`}>
      <span>{children}</span>
      {onClose && (
        <button className="banner-close" onClick={onClose} aria-label="إغلاق">
          ×
        </button>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label="إغلاق">
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
      <span className="install-banner-icon" aria-hidden="true">📲</span>
      <div className="install-banner-body">
        <div className="install-banner-title">ثبّت معاك على شاشتك الرئيسية</div>
        <div className="install-banner-desc">
          {ios
            ? 'دوس على زرار المشاركة ⬆️ تحت في Safari، بعدين "إضافة إلى الشاشة الرئيسية"'
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
