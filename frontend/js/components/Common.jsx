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

// نفس شكل Field بالظبط، بس لمجموعة عناصر مش حقل واحد (مواعيد الجرعات، اختيار
// نوع القياس، الرقمين بتوع الضغط). السبب إن <label> حوالين أكتر من عنصر
// بيربط نفسه بأول واحد فيهم، فالدوسة على العنوان كانت بتفعّل زرار "إضافة معاد"
// أو تفتح ساعة أول جرعة من غير ما المستخدم يقصد. هنا العنوان نص عادي،
// والمجموعة نفسها بتتوصف لقارئ الشاشة بـ aria-label من العنصر اللي جواها.
function FieldGroup({ label, children }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      {children}
    </div>
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

/* ============================================
   النافذة (Modal)
   ============================================
   كل شاشات "الإضافة والتعديل" في التطبيق بتتفتح جوه المكوّن ده: دواء جديد،
   موعد جديد، قياس جديد، مريض جديد، لينك الدخول، الإعدادات. يعني أي تحسين هنا
   بيتوزّع على التطبيق كله مرة واحدة، وأي إهمال هنا بيتوزّع كمان.

   الشكل: شيت بيطلع من تحت على الموبايل، ونافذة في نص الشاشة على الشاشة الكبيرة.
   كل نافذة ليها هوية: شريط تدرّج رفيع فوق، شريحة أيقونة بنبرة لونية، عنوان،
   وسطر تحته بيقول النافذة دي بتعمل إيه - عشان المستخدم يعرف هو فين من غير
   ما يقرا الفورم كله الأول.

   ودي المسؤوليات اللي جوه المكوّن غير الشكل:
   1. Portal لـ <body> - أي عنصر عليه transform بيبقى هو المرجع لأي عنصر
      position:fixed جواه، فنافذة بتتفتح من جوه كارت متحرّك كانت ممكن تتقص أو
      تتموضع غلط. الـ portal بيطلّعها برّه شجرة الشاشة خالص فالمشكلة دي مبقاش
      ليها وجود أصلًا (بدل ما نفضل حاسبين من كل حركة إن متسيبش transform وراها).
   2. حبس التركيز (focus trap) - Tab بيلف جوه النافذة وميهربش للصفحة اللي وراها.
   3. رجوع التركيز لزرار اللي فتح النافذة بعد ما تتقفل.
   4. حركة خروج - النافذة بتنزل وتختفي بدل ما تتشال من الشاشة فجأة.
   5. السحب لتحت بيقفلها على الموبايل، زي أي شيت في تطبيق أصلي.
   6. ظل بيظهر تحت الهيدر أو فوق الفوتر بس لما يكون فيه محتوى مخبّي ورا كل
      واحد فيهم - إشارة إن "فيه كمان تحت" من غير أي نص.
*/

const MODAL_FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]),' +
  ' textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// لازم تساوي مدة حركة الخروج في css/modal.css - لو اتغيرت هناك تتغير هنا
const MODAL_EXIT_MS = 240;
// مسافة السحب اللي بعدها الشيت يتقفل بدل ما يرجع مكانه
const MODAL_DRAG_CLOSE_PX = 110;
// أو سحبة سريعة قصيرة (بيكسل في الملي ثانية) - الحركة السريعة نية واضحة برضه
const MODAL_DRAG_CLOSE_VELOCITY = 0.5;

function prefersReducedMotion() {
  return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function Modal({
  title,
  subtitle,
  icon,
  tone = 'primary',
  onClose,
  onSubmit,
  footer,
  children,
}) {
  // useId بيدّي معرّف فريد وثابت عبر إعادة الرسم - ده بالظبط اللي هو موجود عشانه.
  // (قبل كده كان عدّاد على مستوى الملف بيزيد مع كل رندر من غير داعي.)
  const seq = React.useId();
  const titleId = `modal-title-${seq}`;
  const descId = `modal-desc-${seq}`;

  const overlayRef = React.useRef(null);
  const sheetRef = React.useRef(null);
  const bodyRef = React.useRef(null);
  const closingRef = React.useRef(false);

  // onClose غالبًا بتتبعت كدالة سهمية جديدة مع كل رندر، فبنمسكها في ref ونخلي
  // الـ effect يشتغل مرة واحدة بس عند الفتح. من غير كده الـ effect كان ممكن
  // يعيد نفسه مع أي رندر ويخطف التركيز من الحقل اللي المستخدم بيكتب فيه.
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  /* ---------- القفل (بحركة خروج) ---------- */

  const requestClose = React.useCallback(function requestClose() {
    if (closingRef.current) return; // اتداس مرتين بسرعة / Escape وقت ما هي بتقفل
    closingRef.current = true;

    if (prefersReducedMotion()) {
      onCloseRef.current();
      return;
    }
    if (overlayRef.current) overlayRef.current.classList.add('is-closing');
    setTimeout(() => onCloseRef.current(), MODAL_EXIT_MS);
  }, []);

  /* ---------- التركيز: الدخول، الحبس، والرجوع ---------- */

  React.useEffect(() => {
    // مين كان مركّز قبل ما النافذة تفتح - عشان نرجّعله التركيز لما تتقفل
    const returnTo = document.activeElement;

    /* التركيز بيروح للنافذة نفسها مش لزرار الإغلاق: قارئ الشاشة بيقرا وقتها
       عنوان النافذة والسطر اللي بيشرحها (aria-labelledby/describedby) بدل ما
       يقول "إغلاق" وخلاص، والـ Tab بعدها بينزل لأول حقل عادي. */
    if (sheetRef.current) sheetRef.current.focus();

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        requestClose();
        return;
      }
      if (e.key !== 'Tab' || !sheetRef.current) return;

      // حبس التركيز: من آخر عنصر بيلف لأول واحد، ومن أول واحد بـ Shift+Tab
      // بيرجع لآخر واحد - فمستخدم الكيبورد ميضيعش في الصفحة اللي ورا النافذة.
      const items = Array.prototype.filter.call(
        sheetRef.current.querySelectorAll(MODAL_FOCUSABLE),
        (el) => el.offsetWidth > 0 || el.offsetHeight > 0
      );
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === first || active === sheetRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown, true);

    // منع سكرول الصفحة اللي ورا النافذة وهي مفتوحة - من غير كده الموبايل
    // بيسكرول الصفحة اللي تحت لما السكرول جوه النافذة يخلص.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      // شرط focus موجود: العنصر ممكن يكون اتشال من الصفحة وإحنا مفتوحين
      if (returnTo && typeof returnTo.focus === 'function' && document.contains(returnTo)) {
        returnTo.focus();
      }
    };
  }, [requestClose]);

  /* ---------- ظلال الهيدر والفوتر حسب مكان السكرول ---------- */

  const [edges, setEdges] = React.useState({ top: true, bottom: true });

  const syncEdges = React.useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    const atTop = el.scrollTop <= 1;
    // الـ 2 بيكسل دي هامش أمان: القسمة على شاشات فيها device pixel ratio كسري
    // بتخلي المجموع يقف على 0.5 بيكسل من الآخر فمبيوصلش للتساوي أبدًا
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
    setEdges((prev) => (prev.top === atTop && prev.bottom === atBottom ? prev : { top: atTop, bottom: atBottom }));
  }, []);

  /* من غير مصفوفة اعتماديات: بيتقاس بعد كل رسم.
     محتوى النافذة بيكبر ويصغر وهي مفتوحة (إضافة ميعاد جرعة، ظهور رسالة خطأ،
     تبديل نوع القياس لواحد بحقلين) - وكل تغيير من دول بيعدي من رندر هنا.
     القياس نفسه تلات قراءات أرقام من العنصر، وsetEdges بيرجع نفس الكائن لو
     مفيش تغيير، فمفيش رسم زيادة ولا دورة لا نهائية. */
  React.useLayoutEffect(syncEdges);

  React.useLayoutEffect(() => {
    /* الرسم مش الحالة الوحيدة اللي بتغيّر الحواف: كيبورد الموبايل لما يطلع
       بيقصّر النافذة من غير ما أي حاجة في React تتغيّر، وكذلك تدوير الشاشة. */
    if (typeof ResizeObserver === 'undefined' || !bodyRef.current) return;
    const ro = new ResizeObserver(syncEdges);
    ro.observe(bodyRef.current);
    return () => ro.disconnect();
  }, [syncEdges]);

  /* ---------- السحب لتحت عشان تتقفل (لمس بس، وفي وضع الشيت بس) ---------- */

  const drag = React.useRef({ active: false, startY: 0, dy: 0, startedAt: 0 });

  function isSheetMode() {
    return Boolean(window.matchMedia && window.matchMedia('(max-width: 639px)').matches);
  }

  function onDragStart(e) {
    if (closingRef.current || !isSheetMode() || e.touches.length !== 1) return;
    drag.current = { active: true, startY: e.touches[0].clientY, dy: 0, startedAt: Date.now() };
    if (sheetRef.current) sheetRef.current.style.transition = 'none';
  }

  function onDragMove(e) {
    const d = drag.current;
    if (!d.active) return;
    // لتحت بس: السحب لفوق مش بيعمل حاجة (النافذة أصلاً واصلة لآخر الشاشة)
    const dy = Math.max(0, e.touches[0].clientY - d.startY);
    d.dy = dy;
    if (!sheetRef.current || !overlayRef.current) return;
    // بنكتب على الـ DOM مباشرة مش عن طريق state: الحركة دي بتحصل مع كل إطار
    // وهي الإصبع ماشية، وأي setState هنا معناه إعادة رسم كاملة 60 مرة في الثانية.
    sheetRef.current.style.transform = `translate3d(0, ${dy}px, 0)`;
    // الخلفية بتفتح تدريجيًا مع السحب - المستخدم بيشوف إن هو "بيقفل" فعلًا
    overlayRef.current.style.setProperty('--drag-fade', String(Math.max(0.25, 1 - dy / 380)));
  }

  function onDragEnd() {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;

    const velocity = d.dy / Math.max(1, Date.now() - d.startedAt);
    const shouldClose = d.dy > MODAL_DRAG_CLOSE_PX || velocity > MODAL_DRAG_CLOSE_VELOCITY;

    if (!shouldClose) {
      // رجوع لمكانه: بنشيل الـ inline styles فالانتقال المعرّف في الـ CSS بيشتغل
      if (sheetRef.current) {
        sheetRef.current.style.transition = '';
        sheetRef.current.style.transform = '';
      }
      if (overlayRef.current) overlayRef.current.style.removeProperty('--drag-fade');
      return;
    }

    if (closingRef.current) return;
    closingRef.current = true;

    /* الخروج هنا مش بحركة الـ CSS العادية: الشيت واقف دلوقتي عند نقطة إصبع
       المستخدم، ولو سيبنا الـ keyframe يشتغل هيقفز لأول الشاشة قبل ما ينزل.
       فبنكمّل من مكانه الحالي بانتقال inline، والـ data-drag بيوقف الـ keyframe. */
    if (overlayRef.current) {
      overlayRef.current.setAttribute('data-drag', 'out');
      overlayRef.current.classList.add('is-closing');
    }
    if (sheetRef.current) {
      sheetRef.current.style.transition = `transform ${MODAL_EXIT_MS}ms cubic-bezier(0.32, 0, 0.67, 0)`;
      sheetRef.current.style.transform = 'translate3d(0, 100%, 0)';
    }
    setTimeout(() => onCloseRef.current(), MODAL_EXIT_MS);
  }

  /* ---------- الضغط على الخلفية ---------- */

  // بنسجّل مكان بداية الضغطة: من غير كده، لو المستخدم بدأ يعلّم على نص جوه
  // النافذة وسحب إيده لبرّه، الـ click كان بيتحسب على الخلفية والنافذة تتقفل
  // وهو بيحاول ينسخ حاجة.
  const pressStartedOnOverlay = React.useRef(false);

  function onOverlayPointerDown(e) {
    pressStartedOnOverlay.current = e.target === e.currentTarget;
  }

  function onOverlayClick(e) {
    if (e.target === e.currentTarget && pressStartedOnOverlay.current) requestClose();
  }

  const Shell = onSubmit ? 'form' : 'div';
  const shellProps = { className: 'modal-shell' };
  if (onSubmit) shellProps.onSubmit = onSubmit;

  const node = (
    <div
      className="modal-overlay"
      ref={overlayRef}
      onMouseDown={onOverlayPointerDown}
      onTouchStart={onOverlayPointerDown}
      onClick={onOverlayClick}
    >
      <div
        className="modal"
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? descId : undefined}
        tabIndex={-1}
        data-at-top={edges.top ? 'true' : 'false'}
        data-at-bottom={edges.bottom ? 'true' : 'false'}
      >
        {/* شريط تدرّج الهوية على حرف النافذة العلوي */}
        <span className="modal-accent" aria-hidden="true" />

        {/* منطقة المسك: المقبض + الهيدر. السحب من هنا بس - مش من جسم الفورم،
            عشان محدش يقفل النافذة وهو بيحاول يسكرول الحقول اللي جواها. */}
        <div
          className="modal-grab"
          onTouchStart={onDragStart}
          onTouchMove={onDragMove}
          onTouchEnd={onDragEnd}
          onTouchCancel={onDragEnd}
        >
          <span className="modal-grip" aria-hidden="true" />

          <div className="modal-header">
            {icon && (
              <span className={`icon-chip icon-chip-sm modal-icon tone-${tone}`} aria-hidden="true">
                <Icon name={icon} size={22} />
              </span>
            )}
            <div className="modal-heading">
              <h3 className="modal-title" id={titleId}>
                {title}
              </h3>
              {subtitle && (
                <p className="modal-subtitle" id={descId}>
                  {subtitle}
                </p>
              )}
            </div>
            <button type="button" className="modal-close" onClick={requestClose} aria-label="إغلاق">
              <Icon name="close" size={21} strokeWidth={2.2} />
            </button>
          </div>
        </div>

        <Shell {...shellProps}>
          <div className="modal-body" ref={bodyRef} onScroll={syncEdges}>
            {children}
          </div>
          {footer && (
            <div className="modal-footer">
              {typeof footer === 'function' ? footer(requestClose) : footer}
            </div>
          )}
        </Shell>
      </div>
    </div>
  );

  // برّه شجرة الشاشة خالص - شوف السبب في تعليق المكوّن فوق
  return ReactDOM.createPortal(node, document.body);
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
