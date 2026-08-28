/* ============================================
   MA3ak (معاك) - شاشة المريض
   تصميم مختلف تمامًا عن شاشة المتابع: حاجة واحدة بس على الشاشة
   (الأدوية اللي هياخدها النهارده)، وزرار كبير "حصلت مشكلة؟" بضغطة واحدة.
   من غير تابات، من غير قوائم، من غير خطوات.
   ============================================ */

// getDoseAvailability و DOSE_EARLY_MINUTES منقولين لملف js/doseLogic.js (منطق بحت، من غير JSX) -
// عشان يبقى قابل للاختبار بـ node:test من غير ما يحتاج متصفح. شوف frontend/test/doseLogic.test.js.

// availableFrom جسم Date حقيقي (مش سترينج زي اللي جاي من الـ API)، فبنعرضه بدالة لوحده
// بدل formatTime اللي بتفترض سترينج "YYYY-MM-DD HH:MM:SS".
function formatTimeObj(dateObj) {
  return dateObj.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

/* بيوصف ميعاد بالنسبة للنهاردة: "النهاردة الساعة 10:00 ص" / "بكرة" / "بعد 3 أيام".
   نفس فكرة describeCairoWhen في الباك إند - كبير السن مش المفروض يحسب الفرق
   بين تاريخين بنفسه عشان يعرف الكشف امتى. */
function describeApptWhen(appointmentAt) {
  const clock = formatTime(appointmentAt);

  /* الفرق بين اليومين بيتحسب بتوقيت مصر على الجنبين.

     قبل كده كان at متقري بتوقيت مصر بينما startOfToday بتوقيت **الجهاز** -
     خلط بين توقيتين في نفس الطرح. على جهاز مضبوط على توقيت تاني (مسافر، أو
     إعدادات غلط) كان بيطلّع "بكرة" على موعد النهاردة. باقي المشروع كله موحّد
     على قراية التواريخ كتوقيت مصر، ودي كانت آخر حتة فايتة. */
  const cairoDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(d);
  const dayIndex = (ymd) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return Math.floor(Date.UTC(y, m - 1, d) / (24 * 3600 * 1000));
  };
  const days = dayIndex(String(appointmentAt).slice(0, 10)) - dayIndex(cairoDay(new Date()));

  if (days <= 0) return `النهاردة الساعة ${clock}`;
  if (days === 1) return `بكرة الساعة ${clock}`;
  if (days === 2) return `بعد بكرة الساعة ${clock}`;
  return `بعد ${days} أيام - الساعة ${clock}`;
}

/* نفس الفكرة بس للماضي: "النهاردة 8:00 ص" / "إمبارح" / "من 3 أيام".
   دالة منفصلة عن describeApptWhen مش نفسها بعلامة سالبة - دي بتوصف حاجة حصلت
   والتانية بتوصف حاجة جاية، والصياغة العربية مختلفة تمامًا. */
function describePastWhen(recordedAt) {
  const clock = formatTime(recordedAt);
  const cairoDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(d);
  const dayIndex = (ymd) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return Math.floor(Date.UTC(y, m - 1, d) / (24 * 3600 * 1000));
  };
  const days = dayIndex(cairoDay(new Date())) - dayIndex(String(recordedAt).slice(0, 10));

  if (days <= 0) return `النهاردة ${clock}`;
  if (days === 1) return `إمبارح ${clock}`;
  if (days === 2) return `أول إمبارح ${clock}`;
  return `من ${days} أيام`;
}

// الرنة نفسها (Web Audio + اهتزاز) اتنقلت لـ js/components/Alarm.jsx مع شاشة
// المنبه، لأن الاتنين حاجة واحدة: الرنة بتبدأ مع الشاشة وبتقف معاها.

// tone بيحدد لون دايرة الأيقونة - بنغلّفها في خلفية موحّدة المقاس واللون بدل ما نسيب
// شكل الإيموجي الخام (اللي بيختلف كتير من نوع لنوع - بعضها ملوّن وبعضها فلات) يبان متلخبط
const ISSUE_OPTIONS = [
  { key: 'forgot_dose', icon: 'clock', label: 'نسيت آخد جرعة', tone: 'blue' },
  { key: 'med_finished', icon: 'pill', label: 'الدوا خلص', tone: 'amber' },
  { key: 'unclear_dose', icon: 'question', label: 'مش فاهم إزاي آخده', tone: 'purple' },
  { key: 'side_effect', icon: 'unwell', label: 'حاسس بتعب بعد الدوا', tone: 'rose' },
  { key: 'other', icon: 'warning', label: 'حاجة تانية', tone: 'gray' },
  { key: 'want_call', icon: 'phone', label: 'عايز حد يكلمني', tone: 'danger', urgent: true },
];

function PatientHome({
  user,
  onLogout,
  darkMode,
  onSetDarkMode,
  fontLarge,
  onSetFontLarge,
  autoNightScale,
  onToggleAutoNightScale,
  alarmEnabled,
  onToggleAlarmEnabled,
  installPrompt,
  onInstalled,
}) {
  const [doses, setDoses] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  // بيانات معروضة من نسخة محفوظة على الجهاز لأن النت قاطع - المريض لازم يعرف
  const [staleSince, setStaleSince] = React.useState(null);
  const [appointments, setAppointments] = React.useState([]);
  const [showVitals, setShowVitals] = React.useState(false);
  const [showHistory, setShowHistory] = React.useState(false);
  const [showIssue, setShowIssue] = React.useState(false);
  const [showSettings, setShowSettings] = React.useState(false);
  const [caregivers, setCaregivers] = React.useState([]);
  const [now, setNow] = React.useState(() => new Date());
  const [notifHelpOpen, setNotifHelpOpen] = React.useState(false);
  const notifiedDoseIds = React.useRef(new Set());
  const hasSeededDoses = React.useRef(false);

  /* ---------- حالة المنبه ----------
     alarmDoseId بيمسك id الجرعة اللي المنبه شغّال عليها دلوقتي (مش الصف نفسه):
     الصف بيتجدد مع كل تحميل من السيرفر، فلو مسكناه هنا كنا هنعرض بيانات قديمة
     بعد أول تحديث. الـ id ثابت، وبنجيب أحدث صف بيه وقت الرسم. */
  const [alarmDoseId, setAlarmDoseId] = React.useState(null);
  const [alarmBusy, setAlarmBusy] = React.useState(false);
  const [alarmError, setAlarmError] = React.useState('');
  const ringerRef = React.useRef(null);
  if (!ringerRef.current) ringerRef.current = createAlarmRinger();

  // حالة تنبيهات الجهاز (Web Push) - مش Notification.permission لوحدها، لأن
  // على الآيفون السبب الحقيقي غالبًا "التطبيق مش متثبت" مش "المستخدم رفض"
  const [pushStatus, setPushStatus] = React.useState(() => getPushStatus());
  const [pushBusy, setPushBusy] = React.useState(false);
  const [pushError, setPushError] = React.useState('');

  /* بيفعّل تنبيهات الجهاز (Web Push) - القناة الوحيدة اللي بتوصّل التذكير
     والتطبيق مقفول. لازم يتنادى من ضغطة مستخدم حقيقية: المتصفحات بترفض (أو
     بتتجاهل في صمت) طلب الإذن اللي مش جاي من تفاعل، وده كان بيقفل الإشعارات
     بشكل دائم من غير ما المريض يشوف نافذة الإذن أصلاً.

     التفاصيل الكاملة (وقيد الآيفون) في js/push.js. */
  async function handleEnablePush() {
    if (pushStatus === 'blocked' || pushStatus === 'needs-install') {
      setNotifHelpOpen((v) => !v); // مفيش زرار ينفع يتداس - الإرشاد هو الحل الوحيد
      return;
    }
    setPushBusy(true);
    setPushError('');
    try {
      await enablePush();
      setPushStatus(getPushStatus());
    } catch (e) {
      setPushError(e.message);
      setPushStatus(getPushStatus());
    } finally {
      setPushBusy(false);
    }
  }

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      /* أي تسجيل **أو بلاغ** اتحبس في الطابور وقت ما النت كان قاطع بيتبعت
         الأول - قبل ما نجيب البيانات، عشان اللي هيرجع يكون شايف نتيجته فعلاً */
      await flushOfflineQueue().catch(() => {});

      const data = await api.getTodayDoses(user.id);
      setDoses(data.doses);
      cacheTodayDoses(user.id, data.doses);
      setStaleSince(null);
      setError('');
    } catch (e) {
      /* النت قاطع: نعرض آخر نسخة محفوظة بدل شاشة خطأ فاضية. المريض عارف إن
         عنده دوا، ورسالة "حصل خطأ" مش بديل مقبول لجدول جرعاته. */
      const cached = readCachedTodayDoses(user.id);
      if (cached) {
        setDoses(cached.doses);
        setStaleSince(cached.at);
        setError('');
      } else {
        setError(e.message);
      }
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  React.useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [load]);

  /* المريض ممكن يسجّل الجرعة من جوّه الإشعار نفسه من غير ما يفتح التطبيق -
     والـ Service Worker بيبلّغنا لما ده يحصل. من غير ده، لو التطبيق كان مفتوح
     في تاب في الخلفية، هيفضل عارض الجرعة كأنها لسه مستنية لحد التحديث الجاي. */
  React.useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    function onMessage(event) {
      const data = event.data || {};
      if (data.type !== 'ma3ak:dose-changed' && data.type !== 'ma3ak:notification-click') return;
      load();
      /* المريض داس على إشعار جرعة: نفتحله شاشة المنبه للجرعة دي على طول.

         ده مهم بالذات على iOS: سفاري مبيعرضش أزرار الإشعار خالص (قرار من آبل)،
         فزرار "خدته" مش موجود عنده - كل اللي يقدر يعمله إنه يدوس على الإشعار.
         من غير السطر ده كان بيتفتحله التطبيق ويدوّر على الجرعة بنفسه. */
      if (data.doseId) {
        setAlarmDoseId(Number(data.doseId));
        setAlarmError('');
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [load]);

  /* نفس الحالة بس والتطبيق كان مقفول خالص: الـ Service Worker بيفتح تاب جديد
     على /?dose=<id> (مفيش تاب موجود يبعتله رسالة). بنقرا الرقم مرة واحدة
     وننضّف شريط العنوان - عشان إعادة تحميل الصفحة ما تفتحش المنبه تاني. */
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const doseId = params.get('dose');
    if (!doseId) return;
    window.history.replaceState({}, '', '/');
    setAlarmDoseId(Number(doseId));
  }, []);

  /* المواعيد الطبية الجاية.

     دي كانت فجوة واضحة: التطبيق كان بيبعت للمريض إشعار "موعد بكرة"، وشاشة
     المريض مفيهاش أي ذكر للمواعيد خالص - تنبيه بيوصل لحد مش قادر يتصرف بناءً
     عليه. */
  React.useEffect(() => {
    api
      .getAppointments(user.id)
      .then((data) => setAppointments(data.appointments || []))
      .catch(() => {
        /* صامت - قسم المواعيد ببساطة مش هيبان */
      });
  }, [user.id]);

  // أول ما النت يرجع: نبعت اللي في الطابور ونحدّث - من غير ما المريض يعمل حاجة
  React.useEffect(() => {
    function onOnline() {
      load();
    }
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [load]);

  // "متابعك": مين المتابع (المتابعين) اللي بيشوفوا جرعات المريض ده - بيبان في كارت بسيط أعلى الشاشة
  React.useEffect(() => {
    api
      .getCaregivers(user.id)
      .then((data) => setCaregivers(data.caregivers || []))
      .catch(() => {
        /* صامت - الكارت ببساطة مش هيبان لو معرفناش نجيب المتابعين */
      });
  }, [user.id]);

  // بيحدّث "الوقت الحالي" بشكل مستقل عن تحميل البيانات، عشان زرار الجرعة يتفتح لوحده
  // بالثانية اللي يوصلها ميعادها من غير ما المريض يحتاج يقفل ويفتح التطبيق تاني
  React.useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(tick);
  }, []);

  // ملحوظة: عمدًا مفيش طلب صلاحية تلقائي هنا لحظة فتح الصفحة. المتصفحات بترفض (أو بتتجاهل)
  // طلبات الصلاحية اللي مش جاية من ضغطة مستخدم حقيقية، وده كان بيقفل صلاحية الإشعارات
  // بشكل دائم من غير ما المريض يشوف نافذة الإذن أصلاً. الطلب دلوقتي بيحصل بس لما المريض
  // يدوس على زرار "تفعيل" بنفسه - شوف requestNotifPermission فوق.

  /* بمجرد ما جرعة توصل ميعادها والتطبيق مفتوح، بنفتح شاشة المنبه ونبدأ الرنة.

     أول تحميل بيتسجّل من غير أي رنة: لو المريض فتح التطبيق ولقى كذا جرعة وصل
     ميعادها بالفعل (يحصل مثلاً لو فتحه بالليل، أو لو السيرفر كان نايم فمعلّمش
     الجرعات القديمة كـ"فايتة")، كان بيرن لكلها مع بعض في نفس اللحظة - ضجة
     مفزعة من غير فايدة. الجرعة اللي وصل ميعادها فعلاً باينة قدامه في الكارت
     الكبير على الشاشة أصلاً. المنبه بقى بس للجرعة اللي ييجي ميعادها والتطبيق
     مفتوح - وده الغرض منه من الأساس. (نفس أسلوب hasSeededIssues في app.jsx)

     ملحوظة: الجرعة اللي في غفوة مبتفتحش المنبه - المريض طلب صراحة يتأجّل،
     والسيرفر هو اللي هيرنّ تاني في ميعاد الغفوة (scheduler.js). */
  React.useEffect(() => {
    const isFirstPass = !hasSeededDoses.current;

    doses.forEach((d) => {
      if (d.status !== 'pending') return;
      if (d.snooze_until && parseCairoDatetime(d.snooze_until) > now) return;
      // parseCairoDatetime بيقرا الميعاد كتوقيت مصر دايمًا - زي ما getDoseAvailability
      // بتعمل تحت بالظبط. new Date(...) العادية كانت بتقراه بتوقيت جهاز المريض،
      // فالرنة كانت ممكن تيجي في وقت غلط تمامًا على أي جهاز مضبوط على توقيت تاني.
      if (parseCairoDatetime(d.scheduled_at) > now) return;
      if (notifiedDoseIds.current.has(d.id)) return;
      notifiedDoseIds.current.add(d.id);

      if (isFirstPass) return; // اتسجّلت كـ"شوفناها" بس من غير منبه

      setAlarmDoseId(d.id);
      setAlarmError('');
      if (alarmEnabled) ringerRef.current.start();
    });

    // مبنعلّمش "اتسجلت" غير لما تكون الجرعات وصلت فعلاً (أول تحميل بيبدأ بمصفوفة فاضية)
    if (isFirstPass && doses.length) hasSeededDoses.current = true;
  }, [doses, now, alarmEnabled]);

  /* الرنة لازم تقف لو المكوّن اتشال وهي شغالة (خروج، أو المتصفح قفل الصفحة).
     من غير التنظيف ده الـ interval بيفضل عايش والاهتزاز بيكمّل على صفحة
     مش موجودة أصلاً. */
  React.useEffect(() => {
    const ringer = ringerRef.current;
    return () => ringer.stop();
  }, []);

  function closeAlarm() {
    ringerRef.current.stop();
    setAlarmDoseId(null);
    setAlarmError('');
  }

  async function handleTake(doseId) {
    setAlarmBusy(true);
    try {
      await api.takeDose(doseId);
      if (doseId === alarmDoseId) closeAlarm();
      load();
    } catch (e) {
      /* فشل شبكة (مش رفض من السيرفر): الجرعة اتاخدت فعلاً والمريض عمل اللازم -
         التسجيل هو اللي مقدرش يوصل. بنحطها في طابور ونبعتها أول ما النت يرجع.
         من غير ده الضغطة كانت بتضيع، والمتابع كان بياخد تنبيه إن الجرعة فاتت
         وهي متاخدة - وده أسوأ من إن الزرار ميشتغلش أصلاً. */
      if (!e.status) {
        queueTake(doseId);
        markDoseTakenLocally(doseId);
        if (doseId === alarmDoseId) closeAlarm();
        setError('مفيش نت دلوقتي - سجّلناها على الجهاز وهتتبعت أول ما النت يرجع');
      } else if (doseId === alarmDoseId) {
        setAlarmError(e.message);
      } else {
        setError(e.message);
      }
    } finally {
      setAlarmBusy(false);
    }
  }

  /* بيعلّم الجرعة "اتاخدت" في الواجهة والنسخة المحفوظة، من غير ما نستنى
     السيرفر. من غير كده المريض بيدوس الزرار والشاشة متتغيرش، فيدوس تاني
     وتالت - وهو أصلاً مش متأكد إن التطبيق سمعه. */
  function markDoseTakenLocally(doseId) {
    setDoses((prev) => {
      const next = prev.map((d) =>
        d.id === doseId ? { ...d, status: 'taken', taken_at: new Date().toISOString() } : d
      );
      cacheTodayDoses(user.id, next);
      return next;
    });
  }

  /* الغفوة: بتأجّل الرنة 10 دقايق من غير ما تلغي الجرعة ولا تخليها "فايتة".
     السيرفر هو اللي بيرنّ تاني (scheduler.js) - يعني الغفوة شغالة حتى لو
     المريض قفل التطبيق بعدها على طول، وده الفرق بينها وبين مؤقت في الصفحة. */
  async function handleSnooze(doseId) {
    setAlarmBusy(true);
    try {
      await api.snoozeDose(doseId);
      closeAlarm();
      load();
    } catch (e) {
      setAlarmError(e.message);
    } finally {
      setAlarmBusy(false);
    }
  }

  // نطق صوتي لموقف الدوا دلوقتي - مفيد لضعاف النظر أو لما القراءة تبقى متعبة
  function speak(text) {
    try {
      if (!('speechSynthesis' in window)) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ar-SA';
      u.rate = 0.95;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch (e) {
      /* الجهاز مش بيدعم النطق الصوتي */
    }
  }

  // تكبير الخط تلقائيًا بعد الساعة 7 مساءً ولحد الساعة 6 صباحًا - لتحسين الرؤية بالليل
  const isNightBoost = autoNightScale && (now.getHours() >= 19 || now.getHours() < 6);

  const done = doses.filter((d) => d.status !== 'pending');
  const medicationNames = [...new Set(doses.map((d) => d.name))];
  const firstName = (user.name || '').trim().split(' ')[0] || user.name;

  // بنحسب لكل جرعة معلّقة لسه، هي "مفتوحة" (قابلة للتأكيد دلوقتي) ولا "مقفولة" (لسه بدري)،
  // عشان نبني منها الجرعة الرئيسية اللي واخدة الشاشة، والباقي كصف تاني تحتها.
  const dosesWithAvailability = doses.map((d) => {
    const { isEarly, isTooLate, availableFrom } = getDoseAvailability(d.scheduled_at, now);
    if (d.status === 'taken') return { ...d, isOpen: false, isLocked: false, isLate: false };
    /* الجرعة "الفايتة" لسه ينفع تتسجّل لفترة (DOSE_LATE_TAKE_HOURS في
       doseLogic.js). قبل كده كانت بتتقفل نهائيًا: المريض يصحى على المنبه بعد
       نص ساعة، ياخد الدوا فعلاً، ويلاقي الزرار مش شغال - فالتطبيق يفضل مسجّل
       إنه فوّتها. ده تسجيل غلط، مش تسجيل دقيق. */
    if (d.status === 'missed') {
      return { ...d, isOpen: false, isLocked: false, isLate: !isTooLate, availableFrom };
    }
    return { ...d, isOpen: !isEarly, isLocked: isEarly, isLate: false, availableFrom };
  });
  const openDoses = dosesWithAvailability.filter((d) => d.isOpen);
  const lockedDoses = dosesWithAvailability.filter((d) => d.isLocked);

  // الجرعة الرئيسية: أول جرعة مفتوحة قابلة للتأكيد. لو معندناش، بنوري الجرعة الجاية المقفولة
  // كـ"جرعة منتظرة". لو معندناش أي حاجة معلّقة لكن فيه جرعات النهارده، يبقى خلصوا كلهم.
  const heroDose = openDoses[0] || null;
  const waitingDose = !heroDose ? lockedDoses[0] || null : null;
  const heroKind = heroDose ? 'open' : waitingDose ? 'waiting' : doses.length > 0 ? 'allDone' : 'empty';
  const heroId = heroDose ? heroDose.id : waitingDose ? waitingDose.id : null;
  const secondaryDoses = dosesWithAvailability.filter((d) => d.id !== heroId);

  /* أحدث صف للجرعة اللي المنبه شغّال عليها. بنشتقّه من doses بدل ما نخزّن
     الصف نفسه في الحالة: doses بيتجدد كل دقيقة من السيرفر، ولو كنا ماسكين
     نسخة قديمة كان المنبه هيفضل عارض بيانات ما بقتش صحيحة (مثلاً جرعة
     اتسجّلت من إشعار على جهاز تاني). */
  /* أقرب موعد خلال أسبوع. أبعد من كده مش حاجة النهاردة، وعرضه بيزحم شاشة
     كل قيمتها إنها بتعرض حاجة واحدة مهمة. */
  const APPOINTMENT_HORIZON_DAYS = 7;
  const nextAppointment = appointments
    .filter((a) => {
      const at = parseCairoDatetime(a.appointment_at);
      return at >= now && at - now <= APPOINTMENT_HORIZON_DAYS * 24 * 3600 * 1000;
    })
    .sort((a, b) => parseCairoDatetime(a.appointment_at) - parseCairoDatetime(b.appointment_at))[0];

  const alarmDose = alarmDoseId ? dosesWithAvailability.find((d) => d.id === alarmDoseId) : null;

  // المنبه بيقفل لوحده لو الجرعة اتسجّلت من أي مكان تاني
  React.useEffect(() => {
    if (alarmDoseId && (!alarmDose || alarmDose.status !== 'pending')) closeAlarm();
  }, [alarmDoseId, alarmDose]);

  function speakAlarmDose(d) {
    speak(
      `وقت ${d.name} دلوقتي` +
        (d.dosage ? `، الجرعة ${d.dosage}` : '') +
        (d.notes ? `. ${d.notes}` : '') +
        '. دوس على زرار خدت الدوا بعد ما تاخده.'
    );
  }

  function speakDoseInfo() {
    let text;
    if (heroKind === 'open') {
      text =
        'معاد ' +
        heroDose.name +
        ' دلوقتي' +
        (heroDose.dosage ? '، الجرعة ' + heroDose.dosage : '') +
        (heroDose.notes ? '. ' + heroDose.notes : '') +
        '. دوس على زرار خدت الدوا بعد ما تاخده.';
    } else if (heroKind === 'waiting') {
      text = 'الجرعة الجاية ' + waitingDose.name + ' الساعة ' + formatTimeObj(waitingDose.availableFrom) + '.';
    } else {
      text = 'خلصت كل جرعات النهارده، مفيش حاجة عليك دلوقتي.';
    }
    speak(text);
  }

  function doseDotStatus(d) {
    if (d.status === 'taken') return 'taken';
    if (d.status === 'missed') return 'missed';
    if (d.isOpen) return 'open';
    return 'locked';
  }
  // أسماء أيقونات من js/icons.jsx
  function secondaryIcon(d) {
    if (d.status === 'taken') return 'checkCircle';
    if (d.status === 'missed') return 'warning';
    if (d.isLocked) return 'clock';
    return 'pill';
  }
  function secondaryMeta(d) {
    if (d.status === 'taken') return `اتاخدت - ${formatTime(d.scheduled_at)}`;
    if (d.status === 'missed') return `فاتت - ${formatTime(d.scheduled_at)}`;
    if (d.isLocked) return `هتفتح الساعة ${formatTimeObj(d.availableFrom)}`;
    return `الساعة ${formatTime(d.scheduled_at)}`;
  }

  const rootClassName = `patient-home${fontLarge ? ' font-large' : ''}${isNightBoost ? ' font-night' : ''}`;

  return (
    <div className={`${rootClassName} ambient`}>
      <header className="patient-header">
        <span className="patient-greeting">أهلاً {firstName}</span>
        <div className="patient-header-actions">
          <button
            className="patient-settings-btn"
            onClick={() => setShowSettings(true)}
            aria-label="الإعدادات"
            title="الإعدادات"
          >
            <Icon name="settings" size={22} />
          </button>
          <button className="patient-logout" onClick={onLogout}>
            خروج
          </button>
        </div>
      </header>

      <main className="patient-main">
        <Banner onClose={() => setError('')}>{error}</Banner>

        {/* المريض لازم يعرف إن اللي قدامه نسخة محفوظة مش بيانات لايف - خصوصًا
            إن الجرعة اللي المتابع ضافها من شوية مش هتكون فيها */}
        {staleSince && (
          <div className="patient-offline-banner">
            <Icon name="refresh" size={20} />
            <span>مفيش نت دلوقتي - دي آخر بيانات وصلتنا {formatTime(new Date(staleSince).toISOString())}</span>
          </div>
        )}

        <InstallBanner deferredPrompt={installPrompt} onInstalled={onInstalled} />

        {/* الجرعة الرئيسية (Spinner/فاضي/كارت الجرعة) لازم تبقى أول حاجة في المحتوى القابل
            للسكرول - هي "الحاجة الواحدة" اللي الشاشة دي مبنية عشانها (شوف تعليق الملف فوق).
            كارت "متابعك" وبانرات الليل/الإشعارات مهمين بس مش بنفس الدرجة، فاتنقلوا تحتها -
            قبل كده كانوا فوق وبياخدوا مساحة كافية تدفع كارت الجرعة وزرار "خدت الدوا" تحت
            حافة الشاشة على موبايلات كتير (خصوصًا أول مرة، لما بانر الإشعارات لسه ظاهر). */}
        {loading ? (
          <Spinner />
        ) : doses.length === 0 ? (
          <div className="patient-empty">
            <div className="patient-empty-icon">
              <Icon name="inbox" size={58} strokeWidth={1.5} />
            </div>
            <p>معندكش أدوية دلوقتي</p>
          </div>
        ) : (
          <div className="patient-today">
            {/* نقط تقدّم صغيرة - جرعة لكل نقطة، عشان المريض يشوف بنظرة واحدة كام باقي */}
            <div className="patient-progress-dots">
              {dosesWithAvailability.map((d) => (
                <span
                  key={d.id}
                  className={`progress-dot progress-dot-${doseDotStatus(d)}${
                    d.id === heroId && heroKind === 'open' ? ' progress-dot-active' : ''
                  }`}
                />
              ))}
            </div>
            <div className="patient-progress-label">{done.length} من {doses.length} جرعات خلصت</div>

            {/* الجرعة الرئيسية: حاجة واحدة بس واضحة على الشاشة كل مرة */}
            {heroKind === 'open' && (
              <div className="patient-hero-card patient-hero-open">
                <button className="patient-hero-speak" onClick={speakDoseInfo} title="اسمع الدواء" aria-label="اسمع الدواء">
                  <Icon name="speaker" size={24} />
                </button>
                <div className="patient-hero-label">دلوقتي</div>
                {/* الصورة بتاخد مكان الأيقونة لو موجودة - شكل الشريط الحقيقي
                    أوضح بكتير من أيقونة برشامة عامة */}
                {heroDose.has_image ? (
                  <MedImage
                    medicationId={heroDose.medication_id}
                    hasImage={heroDose.has_image}
                    className="med-image-hero"
                  />
                ) : (
                  <div className="patient-hero-icon" aria-hidden="true">
                    <Icon name="pill" size={56} strokeWidth={1.7} />
                  </div>
                )}
                <div className="patient-hero-name">{heroDose.name}</div>
                <div className="patient-hero-meta">الساعة {formatTime(heroDose.scheduled_at)}</div>
                {heroDose.dosage && <div className="patient-hero-meta">{heroDose.dosage}</div>}
                {/* تعليمات الدكتور ("خده بعد الأكل") - كانت متخزنة ومتعرضة
                    للمتابع بس، والمريض عمره ما شافها */}
                {heroDose.notes && (
                  <div className="patient-hero-notes">
                    <Icon name="alert" size={17} strokeWidth={2.2} />
                    {heroDose.notes}
                  </div>
                )}
                <button className="patient-hero-btn" onClick={() => handleTake(heroDose.id)}>
                  <Icon name="check" size={30} strokeWidth={2.6} />
                  خدت الدوا
                </button>
              </div>
            )}

            {heroKind === 'waiting' && (
              <div className="patient-hero-card patient-hero-waiting">
                <button className="patient-hero-speak" onClick={speakDoseInfo} title="اسمع الدواء" aria-label="اسمع الدواء">
                  <Icon name="speaker" size={24} />
                </button>
                <div className="patient-hero-label muted">الجرعة الجاية</div>
                <div className="patient-hero-icon" aria-hidden="true">
                  <Icon name="clock" size={48} strokeWidth={1.6} />
                </div>
                <div className="patient-hero-name">{waitingDose.name}</div>
                <div className="patient-hero-meta">
                  هتقدر تأكدها الساعة {formatTimeObj(waitingDose.availableFrom)}
                </div>
              </div>
            )}

            {heroKind === 'allDone' && (
              <div className="patient-hero-card patient-hero-alldone">
                <div className="patient-hero-icon" aria-hidden="true">
                  <Icon name="sparkles" size={54} strokeWidth={1.7} />
                </div>
                <div className="patient-hero-name">خلصت كل جرعات النهارده</div>
              </div>
            )}

            {/* باقي جرعات النهارده - صفوف أصغر تحت الجرعة الرئيسية */}
            {secondaryDoses.length > 0 && (
              <React.Fragment>
                <div className="patient-secondary-title">باقي جرعات النهارده</div>
                <div className="patient-secondary-list stagger">
                  {secondaryDoses.map((d) => (
                    <div key={d.id} className={`patient-secondary-row status-${d.status}`}>
                      <span className="patient-secondary-icon" aria-hidden="true">
                        <Icon name={secondaryIcon(d)} size={24} />
                      </span>
                      <div className="patient-secondary-body">
                        <div className="patient-secondary-name">{d.name}</div>
                        <div className="patient-secondary-meta">{secondaryMeta(d)}</div>
                        {d.notes && <div className="patient-secondary-notes">{d.notes}</div>}
                      </div>
                      {d.isOpen && (
                        <button className="patient-secondary-take" onClick={() => handleTake(d.id)}>
                          <Icon name="check" size={17} strokeWidth={2.6} />
                          خدت
                        </button>
                      )}
                      {/* جرعة فاتت بس لسه ينفع تتسجّل - نص مختلف عشان المريض
                          يفهم إنه بيسجّل حاجة متأخرة مش بيلغي إنها فاتت */}
                      {d.isLate && (
                        <button
                          className="patient-secondary-take patient-secondary-take-late"
                          onClick={() => handleTake(d.id)}
                        >
                          <Icon name="check" size={17} strokeWidth={2.6} />
                          خدتها
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </React.Fragment>
            )}
          </div>
        )}

        {/* أقرب موعد طبي جاي. بيبان بس لو فيه موعد خلال أسبوع - الشاشة دي
            مبنية على "حاجة واحدة كل مرة"، وموعد بعد شهرين مش حاجة النهاردة. */}
        {nextAppointment && (
          <div className="patient-appt-card">
            <span className="patient-appt-icon" aria-hidden="true">
              <Icon name="calendar" size={26} />
            </span>
            <div className="patient-appt-body">
              <div className="patient-appt-label">{describeApptWhen(nextAppointment.appointment_at)}</div>
              <div className="patient-appt-title">{nextAppointment.title}</div>
              {nextAppointment.doctor_name && (
                <div className="patient-appt-meta">د. {nextAppointment.doctor_name}</div>
              )}
              {nextAppointment.location && (
                <div className="patient-appt-meta">{nextAppointment.location}</div>
              )}
            </div>
            <button
              className="patient-appt-speak"
              onClick={() => speak(`عندك ${describeApptWhen(nextAppointment.appointment_at)} ${nextAppointment.title}`)}
              aria-label="اسمع الموعد"
            >
              <Icon name="speaker" size={20} />
            </button>
          </div>
        )}

        {caregivers.length > 0 && (
          <React.Fragment>
            <div className="patient-caregiver-card">
              <div className="patient-caregiver-info">
                <div className="patient-caregiver-label">متابعك</div>
                <div className="patient-caregiver-name">{caregivers[0].name}</div>
              </div>
              {/* زرار الاتصال المباشر. كارت "متابعك" كان بيعرض الاسم وخلاص، فكبير
                  السن اللي حاسس بتعب كان قدامه بلاغ يبعته ويستنى - مش زرار يرن بيه
                  على ابنه. دي أبسط حاجة في الشاشة وأكترهم فايدة وقت الحاجة. */}
              {caregivers[0].phone ? (
                <a className="patient-caregiver-call" href={`tel:${caregivers[0].phone}`}>
                  <Icon name="phone" size={22} strokeWidth={2.2} />
                  اتصل بيه
                </a>
              ) : (
                <div className="patient-caregiver-avatar" aria-hidden="true">
                  {caregivers[0].name.trim()[0] || 'م'}
                </div>
              )}
            </div>

            {/* باقي المتابعين، كل واحد بزرار اتصال بتاعه.

                قبل كده الكارت كان بيقول "+2 كمان" من غير أي طريقة توصلهم - يعني
                لو الأول مش رادّ (وده بالظبط الوقت اللي الزرار موجود عشانه)
                مفيش بديل قدام المريض. الأسامي كلها كانت جاية من الـ API أصلاً. */}
            {caregivers.length > 1 && (
              <div className="patient-caregiver-more">
                <div className="patient-caregiver-more-label">متابعين تانيين</div>
                {caregivers.slice(1).map((c) => (
                  <div key={c.id} className="patient-caregiver-row">
                    <span className="patient-caregiver-row-name">{c.name}</span>
                    {c.phone ? (
                      <a className="patient-caregiver-call small" href={`tel:${c.phone}`}>
                        <Icon name="phone" size={18} strokeWidth={2.2} />
                        اتصل
                      </a>
                    ) : (
                      <span className="patient-caregiver-row-nophone">مفيش رقم</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </React.Fragment>
        )}

        {/* أزرار ثانوية صغيرة عمدًا: مهمة بس مش هي الغرض من الشاشة، والجرعة
            لازم تفضل هي الحاجة الوحيدة الواضحة فوق */}
        <div className="patient-quick-actions">
          <button className="patient-quick-btn" onClick={() => setShowHistory(true)}>
            <Icon name="clock" size={20} />
            اللي خدته قبل كده
          </button>
          <button className="patient-quick-btn" onClick={() => setShowVitals(true)}>
            <Icon name="stethoscope" size={20} />
            سجّل قياس
          </button>
        </div>

        {isNightBoost && (
          <div className="patient-night-banner">
            <Icon name="moon" size={20} />
            <span>وضع الليل: الخط أكبر شوية عشان الرؤية بالليل</span>
          </div>
        )}

        {/* البانر ده مش تفصيلة: من غير تفعيل التنبيهات، التذكير بيشتغل بس
            والتطبيق مفتوح - يعني عمليًا مش بيشتغل. النص بيفرق بين الحالات
            عشان المريض يعرف يعمل إيه بالظبط، مش يبص على زرار مش شغال. */}
        {pushStatus !== 'ready' && pushStatus !== 'unsupported' && (
          <div
            className={`patient-notif-banner${
              pushStatus === 'blocked' || pushStatus === 'needs-install'
                ? ' patient-notif-banner-denied'
                : ''
            }`}
          >
            <Icon name={pushStatus === 'blocked' ? 'bellOff' : 'bell'} size={26} />
            <div className="patient-notif-text">
              {pushStatus === 'needs-install' ? (
                <React.Fragment>
                  <div>عشان التنبيهات تشتغل، ضيف التطبيق لشاشتك الرئيسية</div>
                  {notifHelpOpen && (
                    <div className="patient-notif-help">
                      دوس على زرار المشاركة تحت في Safari، بعدين "إضافة إلى الشاشة الرئيسية".
                      بعد كده افتح التطبيق من الأيقونة اللي هتظهر على شاشتك وفعّل التنبيهات من هناك.
                    </div>
                  )}
                </React.Fragment>
              ) : pushStatus === 'blocked' ? (
                <React.Fragment>
                  <div>التنبيهات موقوفة من إعدادات المتصفح</div>
                  {notifHelpOpen && (
                    <div className="patient-notif-help">
                      افتح إعدادات الموقع من المتصفح (دوس على علامة القفل جنب عنوان الموقع
                      فوق) وفعّل "الإشعارات" من هناك، بعدين ارجع للتطبيق.
                    </div>
                  )}
                </React.Fragment>
              ) : (
                <React.Fragment>
                  <div>فعّل التنبيهات عشان التطبيق يفكّرك بمواعيد دوائك حتى وهو مقفول</div>
                  {pushError && <div className="patient-notif-help">{pushError}</div>}
                </React.Fragment>
              )}
            </div>
            <button className="patient-notif-btn" onClick={handleEnablePush} disabled={pushBusy}>
              {pushStatus === 'blocked' || pushStatus === 'needs-install'
                ? notifHelpOpen
                  ? 'تمام'
                  : 'إزاي؟'
                : pushBusy
                  ? '...'
                  : 'تفعيل'}
            </button>
          </div>
        )}
      </main>

      <button className="patient-issue-btn" onClick={() => setShowIssue(true)}>
        <Icon name="alert" size={28} strokeWidth={2.3} />
        حصلت مشكلة؟
      </button>

      {showIssue && (
        <IssueSheet
          patientId={user.id}
          medications={medicationNames}
          onClose={() => setShowIssue(false)}
        />
      )}

      {showSettings && (
        <SettingsSheet
          darkMode={darkMode}
          onSetDarkMode={onSetDarkMode}
          fontLarge={fontLarge}
          onSetFontLarge={onSetFontLarge}
          autoNightScale={autoNightScale}
          onToggleAutoNightScale={onToggleAutoNightScale}
          alarmEnabled={alarmEnabled}
          onToggleAlarmEnabled={onToggleAlarmEnabled}
          pushStatus={pushStatus}
          onPushStatusChange={setPushStatus}
          showPatientOptions={true}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* شاشة المنبه آخر حاجة في الشجرة عشان تفضل فوق كل حاجة تانية. بتتعرض
          بس لو الجرعة لسه محتاجة فعل - لو المريض سجّلها من إشعار على جهاز
          تاني، أحدث نسخة من الصف هتيجي من load() والشاشة تقفل لوحدها. */}
      {showVitals && <PatientVitalsSheet patientId={user.id} onClose={() => setShowVitals(false)} />}

      {showHistory && <PatientHistorySheet patientId={user.id} onClose={() => setShowHistory(false)} />}

      {alarmDose && alarmDose.status === 'pending' && (
        <AlarmOverlay
          dose={alarmDose}
          busy={alarmBusy}
          error={alarmError}
          onTake={() => handleTake(alarmDose.id)}
          onSnooze={() => handleSnooze(alarmDose.id)}
          onDismiss={closeAlarm}
          onSpeak={speakAlarmDose}
        />
      )}
    </div>
  );
}

function IssueSheet({ patientId, medications, onClose }) {
  const [step, setStep] = React.useState('menu'); // menu | pick-med | sent
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState('');
  // البلاغ اتحبس في الطابور بدل ما يتبعت دلوقتي - الرسالة لازم تفرق
  const [queued, setQueued] = React.useState(false);

  async function send(issueType, medicationName) {
    setSending(true);
    setError('');
    try {
      await api.reportIssue(patientId, issueType, medicationName);
      setQueued(false);
      setStep('sent');
      setTimeout(onClose, 2500);
    } catch (e) {
      /* فشل شبكة (مش رفض من السيرفر): نفس منطق "خدت الدوا" بالظبط.
         المريض عمل اللازم - البلاغ هو اللي مقدرش يوصل. رسالة خطأ هنا معناها
         إنه يفتكر إن محدش هييجي، وده أسوأ من إن الزرار ميشتغلش أصلاً. */
      if (!e.status) {
        queueIssue(patientId, issueType, medicationName);
        setQueued(true);
        setStep('sent');
        setTimeout(onClose, 3500);
        return;
      }
      setError(e.message);
      setSending(false);
    }
  }

  function handlePick(key) {
    if (key === 'med_finished' && medications.length > 1) {
      setStep('pick-med');
      return;
    }
    send(key, key === 'med_finished' ? medications[0] : undefined);
  }

  return (
    <div className="issue-overlay" onClick={step === 'sent' ? undefined : onClose}>
      <div className="issue-sheet" onClick={(e) => e.stopPropagation()}>
        {/* مقبض سحب بصري بيقول للمريض إن ده "شيت" ممكن يتقفل - تفصيلة بسيطة بتوضح طبيعة النافذة */}
        {step !== 'sent' && <div className="issue-sheet-handle" aria-hidden="true" />}

        {step === 'sent' ? (
          <div className="issue-sent">
            <div className="issue-sent-icon" aria-hidden="true">
              <Icon name={queued ? 'refresh' : 'check'} size={46} strokeWidth={2.6} />
            </div>
            <p>
              {queued
                ? 'مفيش نت دلوقتي - سجّلنا البلاغ على الجهاز وهيوصل لمتابعك أول ما النت يرجع'
                : 'تمام، وصل خبر لـ اللي بيتابعك'}
            </p>
          </div>
        ) : step === 'pick-med' ? (
          <React.Fragment>
            <h3 className="issue-title">أنهي دوا خلص؟</h3>
            <Banner onClose={() => setError('')}>{error}</Banner>
            <div className="issue-grid">
              {medications.map((m) => (
                <button
                  key={m}
                  className="issue-option"
                  disabled={sending}
                  onClick={() => send('med_finished', m)}
                >
                  <span className="issue-option-icon tone-amber" aria-hidden="true">
                    <Icon name="pill" size={30} strokeWidth={1.8} />
                  </span>
                  <span>{m}</span>
                </button>
              ))}
            </div>
            <button className="issue-back" onClick={() => setStep('menu')} disabled={sending}>
              رجوع
            </button>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <h3 className="issue-title">حصل إيه؟</h3>
            <p className="issue-subtitle">اختار اللي حصلك، هيوصل خبر فورًا لمتابعك</p>
            <Banner onClose={() => setError('')}>{error}</Banner>
            <div className="issue-grid stagger">
              {ISSUE_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  className={`issue-option${opt.urgent ? ' issue-option-urgent' : ''}`}
                  disabled={sending}
                  onClick={() => handlePick(opt.key)}
                >
                  <span className={`issue-option-icon tone-${opt.tone}`} aria-hidden="true">
                    <Icon name={opt.icon} size={30} strokeWidth={1.8} />
                  </span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
            <button className="issue-close" onClick={onClose} disabled={sending}>
              إلغاء
            </button>
          </React.Fragment>
        )}
      </div>
    </div>
  );
}

/* ============================================
   تسجيل قياس من شاشة المريض

   الـ API كان بيسمح للمريض يسجّل قياساته من الأول (canAccessPatient بيمرّر
   المريض على نفسه)، بس مكانش فيه أي طريقة في الواجهة - فمريض ضغط أو سكر بيقيس
   كل يوم كان مضطر يستنى ابنه يسجّلها.

   الشكل هنا مختلف عن فورم المتابع عن قصد: نوع واحد كل مرة، أزرار كبيرة،
   وحقل رقم واحد أو اتنين مفيش غيرهم. مفيش قوايم منسدلة ولا تاريخ ولا وقت -
   وقت القياس بيتحسب على السيرفر.
   ============================================ */

const PATIENT_VITAL_TYPES = [
  { key: 'blood_pressure', label: 'الضغط', icon: 'pulse', tone: 'rose' },
  { key: 'blood_sugar', label: 'السكر', icon: 'droplet', tone: 'blue' },
  { key: 'weight', label: 'الوزن', icon: 'scale', tone: 'purple' },
  { key: 'heart_rate', label: 'النبض', icon: 'heart', tone: 'danger' },
  { key: 'temperature', label: 'الحرارة', icon: 'thermometer', tone: 'amber' },
];

// آخر كام قراية بتبان تحت الحقول. الرقم صغير عن قصد: الغرض إجابة سؤال
// "كان كام المرة اللي فاتت؟" - مش جدول تاريخ كامل على شاشة كل قيمتها البساطة.
const PATIENT_VITAL_HISTORY = 5;

// بيحوّل صف قياس لنص مقروء - نفس منطق العرض في شاشة المتابع
function formatVitalValue(vital) {
  const v = typeof vital.value_json === 'string' ? JSON.parse(vital.value_json) : vital.value_json;
  if (vital.type === 'blood_pressure') return `${v.systolic}/${v.diastolic}`;
  return String(v.value);
}

function PatientVitalsSheet({ patientId, onClose }) {
  const [type, setType] = React.useState(null);
  const [systolic, setSystolic] = React.useState('');
  const [diastolic, setDiastolic] = React.useState('');
  const [value, setValue] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [done, setDone] = React.useState(false);
  /* القراءات السابقة للنوع المختار.

     دي كانت فجوة واضحة: المريض عنده زرار "سجّل قياس" وبيسجّل كل يوم، ومكانش
     فيه أي طريقة يشوف اللي سجّله. "ضغطي كان كام امبارح؟" سؤال بيتسأل كل يوم
     زي "خدت الدوا ولا لأ" بالظبط - والتاني ليه شاشة كاملة والأول مكانش ليه
     أي حاجة. والـ API بيرجّع آخر 100 قراية من الأول. */
  const [history, setHistory] = React.useState(null);
  // القراءة الأخيرة كانت خطرة؟ السيرفر بيرد بالوصف، والمريض لازم يعرف إن
  // متابعه اتنبّه - مش يفتكر إنها اتسجّلت عادي
  const [alert, setAlert] = React.useState(null);

  React.useEffect(() => {
    if (!type) return undefined;
    let alive = true;
    setHistory(null);
    api
      .getVitals(patientId, type.key)
      .then((data) => {
        if (alive) setHistory((data.vitals || []).slice(0, PATIENT_VITAL_HISTORY));
      })
      .catch(() => {
        if (alive) setHistory([]); // صامت - القسم ببساطة مش هيبان
      });
    return () => {
      alive = false;
    };
  }, [patientId, type]);

  async function save() {
    setSaving(true);
    setError('');
    try {
      const payload =
        type.key === 'blood_pressure'
          ? { systolic: Number(systolic), diastolic: Number(diastolic) }
          : { value: Number(value) };
      const res = await api.addVital({ patientId, type: type.key, value: payload });
      setAlert(res && res.alert ? res.alert : null);
      setDone(true);
      // القراءة الخطرة محتاجة وقت أطول عشان المريض يقرا الرسالة
      setTimeout(onClose, res && res.alert ? 4000 : 1800);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  const canSave =
    type && (type.key === 'blood_pressure' ? systolic !== '' && diastolic !== '' : value !== '');

  return (
    <div className="issue-overlay" onClick={done ? undefined : onClose}>
      <div className="issue-sheet" onClick={(e) => e.stopPropagation()}>
        {!done && <div className="issue-sheet-handle" aria-hidden="true" />}

        {done ? (
          <div className="issue-sent">
            <div className={`issue-sent-icon${alert ? ' issue-sent-icon-alert' : ''}`} aria-hidden="true">
              <Icon name={alert ? 'alert' : 'check'} size={46} strokeWidth={2.6} />
            </div>
            {/* القراءة الخطرة بتتقال للمريض صراحة. من غير كده هو مش عارف إن حاجة
                حصلت، وممكن يقعد مستني من غير ما يعرف إن حد جاي - أو يقلق من
                مكالمة مفاجئة من ابنه. */}
            <p>{alert ? `سجّلنا القياس - ${alert}. بلّغنا متابعك عشان يطمن عليك.` : 'تمام، سجّلنا القياس'}</p>
          </div>
        ) : !type ? (
          <React.Fragment>
            <h3 className="issue-title">هتسجّل إيه؟</h3>
            <div className="issue-grid stagger">
              {PATIENT_VITAL_TYPES.map((t) => (
                <button key={t.key} className="issue-option" onClick={() => setType(t)}>
                  <span className={`issue-option-icon tone-${t.tone}`} aria-hidden="true">
                    <Icon name={t.icon} size={30} strokeWidth={1.8} />
                  </span>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
            <button className="issue-close" onClick={onClose}>
              إلغاء
            </button>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <h3 className="issue-title">{type.label}</h3>
            <Banner onClose={() => setError('')}>{error}</Banner>

            {type.key === 'blood_pressure' ? (
              <div className="patient-vital-pair">
                <label className="patient-vital-field">
                  <span>الرقم الكبير</span>
                  {/* inputMode="numeric" بيطلّع لوحة أرقام على الموبايل بدل
                      الكيبورد الكامل - فرق كبير لحد بيكتب بصعوبة */}
                  <input
                    type="number"
                    inputMode="numeric"
                    value={systolic}
                    onChange={(e) => setSystolic(e.target.value)}
                    autoFocus
                  />
                </label>
                <label className="patient-vital-field">
                  <span>الرقم الصغير</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={diastolic}
                    onChange={(e) => setDiastolic(e.target.value)}
                  />
                </label>
              </div>
            ) : (
              <label className="patient-vital-field patient-vital-single">
                <span>الرقم</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  autoFocus
                />
              </label>
            )}

            <button className="patient-vital-save" onClick={save} disabled={!canSave || saving}>
              <Icon name="check" size={26} strokeWidth={2.6} />
              {saving ? 'بنسجّل...' : 'سجّل'}
            </button>

            {/* اللي سجّلته قبل كده من نفس النوع */}
            {history && history.length > 0 && (
              <div className="patient-vital-history">
                <div className="patient-vital-history-title">آخر قراءات {type.label}</div>
                {history.map((v) => (
                  <div key={v.id} className="patient-vital-history-row">
                    <span className="patient-vital-history-value">{formatVitalValue(v)}</span>
                    <span className="patient-vital-history-when">{describePastWhen(v.recorded_at)}</span>
                  </div>
                ))}
              </div>
            )}

            <button className="issue-back" onClick={() => setType(null)} disabled={saving}>
              رجوع
            </button>
          </React.Fragment>
        )}
      </div>
    </div>
  );
}

/* ============================================
   "اللي خدته قبل كده"

   سؤال بيتسأل كل يوم فعليًا ("أنا خدت دوا امبارح ولا لأ؟") ومكانش فيه أي
   طريقة يجاوب عليها. عرض بسيط: كل يوم سطر بعدد اللي اتاخد واللي فات.
   ============================================ */

const PATIENT_HISTORY_DAYS = 7;

function PatientHistorySheet({ patientId, onClose }) {
  const [days, setDays] = React.useState(null);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    const to = new Date();
    const from = new Date(to.getTime() - (PATIENT_HISTORY_DAYS - 1) * 24 * 3600 * 1000);
    const fmt = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(d);

    api
      .getDoses(patientId, fmt(from), fmt(to))
      .then((data) => {
        // اللي لسه ميعاده مجاش مش "فات" ولا "اتاخد" - عدّه بيخلي اليوم يبان أسوأ من الحقيقة
        const counted = data.doses.filter((d) => d.status !== 'pending');
        const byDay = new Map();
        for (const d of counted) {
          const day = String(d.scheduled_at).slice(0, 10);
          if (!byDay.has(day)) byDay.set(day, { day, taken: 0, missed: 0 });
          byDay.get(day)[d.status === 'taken' ? 'taken' : 'missed'] += 1;
        }
        setDays([...byDay.values()].sort((a, b) => b.day.localeCompare(a.day)));
      })
      .catch((e) => setError(e.message));
  }, [patientId]);

  function dayLabel(day) {
    const cairoDay = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(date);
    if (day === cairoDay(new Date())) return 'النهاردة';
    if (day === cairoDay(new Date(Date.now() - 24 * 3600 * 1000))) return 'إمبارح';
    return new Date(`${day}T12:00:00`).toLocaleDateString('ar-EG', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }

  return (
    <div className="issue-overlay" onClick={onClose}>
      <div className="issue-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="issue-sheet-handle" aria-hidden="true" />
        <h3 className="issue-title">اللي خدته قبل كده</h3>
        <Banner onClose={() => setError('')}>{error}</Banner>

        {!days ? (
          <Spinner />
        ) : days.length === 0 ? (
          <p className="issue-subtitle">مفيش جرعات متسجّلة في آخر {PATIENT_HISTORY_DAYS} أيام</p>
        ) : (
          <div className="patient-history-list">
            {days.map((d) => (
              <div key={d.day} className="patient-history-row">
                <div className="patient-history-day">{dayLabel(d.day)}</div>
                <div className="patient-history-counts">
                  {d.taken > 0 && (
                    <span className="patient-history-taken">
                      <Icon name="checkCircle" size={18} />
                      {d.taken}
                    </span>
                  )}
                  {d.missed > 0 && (
                    <span className="patient-history-missed">
                      <Icon name="warning" size={18} />
                      {d.missed}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <button className="issue-close" onClick={onClose}>
          تمام
        </button>
      </div>
    </div>
  );
}
