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
