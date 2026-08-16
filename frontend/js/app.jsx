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
  const [accessError, setAccessError] = React.useState('');
  const notifiedDoseIds = React.useRef(new Set());
  const notifiedIssueIds = React.useRef(new Set());
  const hasSeededIssues = React.useRef(false);

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
  React.useEffect(() => writeBoolPref('ma3ak_font_large', fontLarge), [fontLarge]);
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
          await onAuthenticated(data.user);
        } catch (e) {
          setToken(null);
          setAccessError(e.message || 'اللينك ده مش شغال');
        }
        setBooting(false);
        return;
      }

      const token = getToken();
      if (!token) {
        setBooting(false);
        return;
      }
      try {
        const data = await api.me();
        await onAuthenticated(data.user);
      } catch (e) {
        setToken(null);
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
    setUser(null);
    setPatients([]);
    setActivePatientId(null);
    setNotifications([]);
    setView('today');
  }

  const refreshPatients = React.useCallback(async () => {
    const data = await api.getPatients();
    setPatients(data.patients);
    if (data.patients.length && !activePatientId) {
      setActivePatientId(data.patients[0].id);
    }
    return data.patients;
  }, [activePatientId]);

  const refreshNotifications = React.useCallback(async () => {
    if (!user) return;
    try {
      const data = await api.getNotifications();
      const unreadIssues = data.notifications.filter(
        (n) => n.type === 'patient_issue' && !n.is_read
      );

      // أول تحميل: نسجل المشاكل الموجودة من غير ما نزعج المتصفح بإشعارات لحاجات قديمة.
      // أي تحديث بعد كده: أي مشكلة جديدة تستاهل إشعار متصفح فوري.
      if (!hasSeededIssues.current) {
        unreadIssues.forEach((n) => notifiedIssueIds.current.add(n.id));
        hasSeededIssues.current = true;
      } else {
        unreadIssues.forEach((n) => {
          if (notifiedIssueIds.current.has(n.id)) return;
          notifiedIssueIds.current.add(n.id);
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('معاك - مشكلة من مريض', { body: n.message });
          }
        });
      }

      setNotifications(data.notifications);
    } catch (e) {
      /* صامت - مش لازم نزعج المستخدم بخطأ خلفي */
    }
  }, [user]);

  React.useEffect(() => {
    if (!user) return;
    refreshNotifications();
    const interval = setInterval(refreshNotifications, 60000);
    return () => clearInterval(interval);
  }, [user, refreshNotifications]);

  async function handleDismissIssue(id) {
    try {
      await api.markNotificationRead(id);
      refreshNotifications();
    } catch (e) {
      /* صامت */
    }
  }

  // تنبيه المتصفح لحظة ما ميعاد الجرعة ييجي (لو المستخدم سامح بالإشعارات)
  React.useEffect(() => {
    if (!user || !activePatientId) return;
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    const check = async () => {
      try {
        const data = await api.getTodayDoses(activePatientId);
        const now = new Date();
        data.doses.forEach((d) => {
          if (d.status !== 'pending') return;
          const scheduled = new Date(d.scheduled_at.replace(' ', 'T'));
          if (scheduled <= now && !notifiedDoseIds.current.has(d.id)) {
            notifiedDoseIds.current.add(d.id);
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('معاك - معاد دوا', { body: `معاد ${d.name} دلوقتي` });
            }
          }
        });
      } catch (e) {
        /* صامت */
      }
    };
    check();
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, [user, activePatientId]);

  if (booting) {
    return (
      <div className="boot-screen">
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

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const issueAlerts = notifications.filter((n) => n.type === 'patient_issue' && !n.is_read);

  let content;
  if (view === 'today') content = <TodayView patientId={activePatientId} />;
  else if (view === 'medications') content = <MedicationsView patientId={activePatientId} />;
  else if (view === 'appointments') content = <AppointmentsView patientId={activePatientId} />;
  else if (view === 'vitals') content = <VitalsView patientId={activePatientId} />;
  else if (view === 'notifications')
    content = <NotificationsView notifications={notifications} onRefresh={refreshNotifications} />;
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
          showPatientOptions={false}
          onClose={() => setShowSettings(false)}
        />
      )}
    </React.Fragment>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
