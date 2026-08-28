/* ============================================
   MA3ak (معاك) - App الرئيسي
   ============================================ */

// رسايل تحقق الفورمات (required/type/minLength...) الافتراضية بتيجي من المتصفح نفسه
// بلغته هو (لغة نظام التشغيل/المتصفح) - مش من صفحتنا (lang="ar") - يعني لو جهاز حد
// شغال بالإنجليزي، هيشوف "Please fill out this field" وسط تطبيق عربي بالكامل. بنعترض
// حدث "invalid" (بيتنادى وقت أي submit فاشل) ونحط رسالة عربية بدلها حسب سبب الرفض.
// لازم يترسموا (setCustomValidity('')) تاني أول ما المستخدم يعدّل القيمة - المتصفح
// بيفضل يعتبر الحقل "غير صالح" على طول الرسالة المخصصة موجودة حتى لو القيمة بقت سليمة.
document.addEventListener(
  'invalid',
  (e) => {
    const el = e.target;
    if (typeof el.setCustomValidity !== 'function') return;
    const v = el.validity;
    if (v.valueMissing) el.setCustomValidity('لازم تملأ الحقل ده');
    else if (v.typeMismatch && el.type === 'email') el.setCustomValidity('اكتب إيميل صحيح');
    else if (v.typeMismatch) el.setCustomValidity('الصيغة دي مش صحيحة');
    else if (v.tooShort) el.setCustomValidity(`لازم يكون ${el.minLength} حروف على الأقل`);
    else if (v.tooLong) el.setCustomValidity(`أقصى حاجة ${el.maxLength} حرف`);
    else if (v.rangeUnderflow) el.setCustomValidity(`القيمة لازم تكون ${el.min} على الأقل`);
    else if (v.rangeOverflow) el.setCustomValidity(`القيمة لازم تكون ${el.max} على الأكتر`);
    else if (v.patternMismatch) el.setCustomValidity('الصيغة دي مش صحيحة');
    else el.setCustomValidity('القيمة دي مش صحيحة');
  },
  true
);
document.addEventListener(
  'input',
  (e) => {
    if (typeof e.target.setCustomValidity === 'function') e.target.setCustomValidity('');
  },
  true
);

// تفضيلات المظهر وإتاحة الاستخدام مخزّنة على الجهاز نفسه (مش في حساب المستخدم)،
// عشان كل جهاز (موبايل المريض، موبايل المتابع) يحتفظ باختياره لوحده.
function readBoolPref(key, fallback) {
  const raw = localStorage.getItem(key);
  return raw === null ? fallback : raw === '1';
}
function writeBoolPref(key, value) {
  localStorage.setItem(key, value ? '1' : '0');
}

function App() {
  const [user, setUser] = React.useState(null);
  const [booting, setBooting] = React.useState(true);
  const [patients, setPatients] = React.useState([]);
  const [activePatientId, setActivePatientId] = React.useState(null);
  const [view, setView] = React.useState('today');
  const [notifications, setNotifications] = React.useState([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [accessError, setAccessError] = React.useState('');
  // آخر id الواجهة شايفاه - بيتبعت للسيرفر كـ since عشان يرجّع الجديد بس
  const latestNotificationId = React.useRef(0);

  // لقطة حدث "قابل للتثبيت" (Chrome/Edge بس - Safari/iOS مالوش الـ API ده خالص).
  // لازم نلقطه ونمنع سلوكه الافتراضي فور ما يحصل، عشان نقدر نعرضه من زرارنا إحنا
  // في InstallBanner بدل ما نستنى المتصفح يقرر لوحده امتى يوريه.
  const [installPrompt, setInstallPrompt] = React.useState(null);
  React.useEffect(() => {
    function onBeforeInstallPrompt(e) {
      e.preventDefault();
      setInstallPrompt(e);
    }
    function onAppInstalled() {
      setInstallPrompt(null);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const [showSettings, setShowSettings] = React.useState(false);
  const [pushStatus, setPushStatus] = React.useState(() => getPushStatus());
  const [darkMode, setDarkMode] = React.useState(() =>
    readBoolPref('ma3ak_dark', window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
  );
  const [fontLarge, setFontLarge] = React.useState(() => readBoolPref('ma3ak_font_large', false));
  const [autoNightScale, setAutoNightScale] = React.useState(() => readBoolPref('ma3ak_auto_night', true));
  const [alarmEnabled, setAlarmEnabled] = React.useState(() => readBoolPref('ma3ak_alarm', true));

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    writeBoolPref('ma3ak_dark', darkMode);
  }, [darkMode]);
  // data-font على :root بيخلي تكبير الخط يطبّق على التطبيق كله (شاشة المتابع كمان)،
  // مش على شاشة المريض بس زي ما كان قبل كده
  React.useEffect(() => {
    document.documentElement.setAttribute('data-font', fontLarge ? 'large' : 'normal');
    writeBoolPref('ma3ak_font_large', fontLarge);
  }, [fontLarge]);
  React.useEffect(() => writeBoolPref('ma3ak_auto_night', autoNightScale), [autoNightScale]);
  React.useEffect(() => writeBoolPref('ma3ak_alarm', alarmEnabled), [alarmEnabled]);

  React.useEffect(() => {
    (async () => {
      // لو المستخدم فتح "لينك دخول مريض" (/access/<token>) بندخّله على طول بدون أي فورم
      const accessMatch = window.location.pathname.match(/^\/access\/([a-zA-Z0-9]+)\/?$/);
      if (accessMatch) {
        window.history.replaceState({}, '', '/');
        try {
          const data = await api.accessViaToken(accessMatch[1]);
          setToken(data.token);
          /* بنحتفظ باللينك نفسه على الجهاز، مش بتوكن الجلسة بس.

             قبل كده كان بيتمسح من شريط العنوان وبيضيع، فأول ما الجلسة تنتهي
             المريض كان بيلاقي شاشة تسجيل دخول بتطلب موبايل وباسورد **مالوش أي
             معنى بالنسبة له** - ومفيش قدامه غير إنه يكلّم ابنه يبعتله اللينك
             من الأول. دلوقتي الجلسة بتتجدّد منه في صمت (شوف js/api.js). */
          setAccessToken(accessMatch[1]);
          await onAuthenticated(data.user);
        } catch (e) {
          setToken(null);
          setAccessToken(null);
          setAccessError(e.message || 'اللينك ده مش شغال');
        }
        setBooting(false);
        return;
      }

      const token = getToken();
      // مفيش توكن جلسة بس فيه لينك دخول محفوظ = مريض رجع بعد ما جلسته انتهت.
      // api.me() هتجدّد لوحدها من اللينك المحفوظ (js/api.js)، فبنكمّل عادي.
      if (!token && !getAccessToken()) {
        setBooting(false);
        return;
      }
      try {
        const data = await api.me();
        await onAuthenticated(data.user);
      } catch (e) {
        setToken(null);
        /* اللينك المحفوظ مبقاش شغال (المتابع ولّد لينك جديد) - ده إلغاء
           متعمّد، فالمريض لازم يعرف إنه محتاج لينك جديد بدل ما يبص على فورم
           دخول مالوش أي علاقة بيه. */
        if (getAccessToken()) {
          setAccessToken(null);
          setAccessError('لينك الدخول بتاعك اتغيّر - اطلب لينك جديد من اللي بيتابعك');
        }
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  async function onAuthenticated(u) {
    setUser(u);
    const data = await api.getPatients();
    setPatients(data.patients);
    if (data.patients.length) {
      setActivePatientId(data.patients[0].id);
    } else if (u.role === 'caregiver') {
      // متابع لسه معندوش مريض: ودّيه على طول لصفحة إضافة مريض
      setView('patients');
    }
  }

  function handleLogout() {
    setToken(null);
    // الخروج المتعمّد بيمسح اللينك المحفوظ كمان - وإلا التطبيق كان هيدخّل
    // المريض تاني على طول وكأن الزرار مش شغال
    setAccessToken(null);
    setUser(null);
    setPatients([]);
    setActivePatientId(null);
    setNotifications([]);
    setUnreadCount(0);
    latestNotificationId.current = 0;
    setView('today');
  }

  const refreshPatients = React.useCallback(async () => {
    const data = await api.getPatients();
    setPatients(data.patients);

    /* المريض النشط ممكن ميكونش موجود في القايمة الجديدة - بيحصل لما المتابع
       يمسحه أو يخرج من متابعته. من غير التصحيح ده كل الشاشات بتفضل بتطلب
       بيانات مريض مش موجود وبترجّع 403، والمتابع بيشوف رسايل خطأ من غير ما
       يفهم إن اللي حصل هو نتيجة الحذف اللي هو نفسه عمله. */
    const stillThere = data.patients.some((p) => p.id === activePatientId);
    if (!stillThere) {
      setActivePatientId(data.patients.length ? data.patients[0].id : null);
    }
    return data.patients;
  }, [activePatientId]);

  /* بيجيب الجديد بس (since = آخر id شفناه) بدل 50 صف كاملين كل دقيقة.
     في الحالة الطبيعية (مفيش جديد) الرد بيبقى العدادات بس - فرق حقيقي على
     بيانات الموبايل البطيئة اللي أغلب مستخدمينا عليها.

     ملحوظة: مبقاش فيه new Notification(...) هنا. الإشعارات دلوقتي بتتبعت من
     السيرفر عن طريق Web Push، فالـ Service Worker هو اللي بيعرضها - سواء
     التطبيق مفتوح أو مقفول. لو خلّينا الصفحة تعرضها كمان، المستخدم كان
     هياخد نفس الإشعار مرتين.

     forceFull بيتستخدم بعد أي فعل بيغيّر حالة إشعار موجود (قراية، "خلصته") -
     since بيجيب الجديد بس، فمكانش هيشوف تغيير على صف قديم. */
  const refreshNotifications = React.useCallback(
    async (forceFull = false) => {
      if (!user) return;
      try {
        const since = forceFull ? 0 : latestNotificationId.current;
        const data = await api.getNotifications(since);
        setUnreadCount(data.unread_count);

        if (forceFull || !since) {
          setNotifications(data.notifications);
        } else if (data.notifications.length) {
          // الجديد بيتحط فوق، والقايمة بتتقص عشان ما تكبرش بلا نهاية في جلسة طويلة
          setNotifications((prev) => [...data.notifications, ...prev].slice(0, 100));
        }
        if (data.latest_id) latestNotificationId.current = data.latest_id;
      } catch (e) {
        /* صامت - مش لازم نزعج المستخدم بخطأ خلفي */
      }
    },
    [user]
  );

  React.useEffect(() => {
    if (!user) return;
    refreshNotifications(true);
    const interval = setInterval(() => refreshNotifications(), 60000);
    return () => clearInterval(interval);
  }, [user, refreshNotifications]);

  /* الـ Service Worker بيبعت رسالة لما المستخدم يدوس على إشعار أو ينفّذ فعل
     من جوّه. من غير ده، الصفحة اللي كانت مفتوحة في الخلفية بتفضل عارضة حالة
     قديمة لحد دورة التحديث الجاية - يعني المريض يدوس "خدته" من الإشعار،
     يفتح التطبيق، ويلاقي الجرعة لسه مستنية. */
  React.useEffect(() => {
    if (!user || !('serviceWorker' in navigator)) return;
    function onMessage(event) {
      const data = event.data || {};
      if (data.type === 'ma3ak:notification-click' || data.type === 'ma3ak:dose-changed') {
        refreshNotifications(true);
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [user, refreshNotifications]);

  async function handleDismissIssue(id) {
    try {
      await api.markNotificationHandled(id);
      refreshNotifications(true);
    } catch (e) {
      /* صامت */
    }
  }

  /* ملحوظة: كان فيه هنا effect بيبعت إشعار متصفح للمتابع مع كل جرعة يوصل
     ميعادها. اتشال عن قصد لسببين:

     1. **التوصيل**: كان بيشتغل بس والتاب مفتوح، وده مش الوضع الطبيعي.
        Web Push بقى بيعمل الشغلانة دي صح، من السيرفر، والتطبيق مقفول.
     2. **الضجيج**: المتابع مش محتاج يترن عليه في كل جرعة - هو مش اللي
        بياخدها. متابع بيترن عليه 6 مرات في اليوم بيقفل الإشعارات خلال يومين،
        وساعتها التنبيه المهم فعلاً (جرعة فاتت، بلاغ عاجل) مش هيوصله.
        دلوقتي المريض هو اللي بياخد تنبيه الجرعة، والمتابع بياخد اللي يستاهل. */

  // مزامنة اشتراك التنبيهات بعد الدخول - عناوين الاشتراك بتتغيّر من نفسها،
  // والجهاز الواحد ممكن يتنقل بين حسابات. التفاصيل في js/push.js
  React.useEffect(() => {
    if (!user) return;
    syncPushSubscription();
  }, [user]);

  if (booting) {
    return (
      <div className="boot-screen">
        {/* شاشة الإقلاع بتبان جزء من ثانية غالبًا - بس لما النت بطيء بتفضل
            ثواني، فالأفضل تبقى شاشة براند حقيقية مش دايرة بتلف على أبيض */}
        <div className="boot-logo" aria-hidden="true">
          <Icon name="brand" size={46} strokeWidth={1.7} />
        </div>
        <div className="boot-name">معاك</div>
        <Spinner />
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onAuthenticated={onAuthenticated} initialError={accessError} />;
  }

  // المريض بيشوف شاشة مختلفة تمامًا: بسيطة، صفحة واحدة، من غير تابات
  if (user.role === 'patient') {
    return (
      <PatientHome
        user={user}
        onLogout={handleLogout}
        darkMode={darkMode}
        onSetDarkMode={setDarkMode}
        fontLarge={fontLarge}
        onSetFontLarge={setFontLarge}
        autoNightScale={autoNightScale}
        onToggleAutoNightScale={() => setAutoNightScale((v) => !v)}
        alarmEnabled={alarmEnabled}
        onToggleAlarmEnabled={() => setAlarmEnabled((v) => !v)}
        installPrompt={installPrompt}
        onInstalled={() => setInstallPrompt(null)}
      />
    );
  }

  /* البانر البارز فوق أي تاب: الحاجات اللي محتاجة تصرّف دلوقتي - بلاغ من
     المريض، أو تصعيد (جرعة فاتت ومحدش رد على التنبيهات). الاتنين حرجين
     ومحدش قفلهم لسه. */
  const issueAlerts = notifications.filter(
    (n) => (n.type === 'patient_issue' || n.type === 'dose_escalation') && !n.handled_at && !n.is_read
  );

  let content;
  if (view === 'today')
    content = <TodayView patientId={activePatientId} onOpenAdherence={() => setView('adherence')} />;
  else if (view === 'adherence')
    content = <AdherenceView patientId={activePatientId} onBack={() => setView('today')} />;
  else if (view === 'medications') content = <MedicationsView patientId={activePatientId} />;
  else if (view === 'appointments') content = <AppointmentsView patientId={activePatientId} />;
  else if (view === 'vitals') content = <VitalsView patientId={activePatientId} />;
  else if (view === 'notifications')
    content = (
      <NotificationsView notifications={notifications} onRefresh={() => refreshNotifications(true)} />
    );
  else if (view === 'patients')
    content = <PatientsView patients={patients} onChanged={refreshPatients} />;

  return (
    <React.Fragment>
      <AppLayout
        user={user}
        patients={patients}
        activePatientId={activePatientId}
        onSwitchPatient={setActivePatientId}
        view={view}
        onChangeView={setView}
        onLogout={handleLogout}
        unreadCount={unreadCount}
        issueAlerts={issueAlerts}
        onDismissIssue={handleDismissIssue}
        onOpenSettings={() => setShowSettings(true)}
      >
        <InstallBanner deferredPrompt={installPrompt} onInstalled={() => setInstallPrompt(null)} />
        {content}
      </AppLayout>
      {showSettings && (
        <SettingsSheet
          darkMode={darkMode}
          onSetDarkMode={setDarkMode}
          fontLarge={fontLarge}
          onSetFontLarge={setFontLarge}
          pushStatus={pushStatus}
          onPushStatusChange={setPushStatus}
          showPatientOptions={false}
          onClose={() => setShowSettings(false)}
        />
      )}
    </React.Fragment>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
