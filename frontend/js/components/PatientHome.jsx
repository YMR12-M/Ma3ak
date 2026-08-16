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

// بيرن التليفون لحظة ما ميعاد جرعة ييجي: صوت (Web Audio - مش محتاج ملف صوت ولا نت)
// + فايبريشن (لو الجهاز بيدعمها). ده شغال بس والتطبيق مفتوح في المتصفح (مش لو التاب مقفول خالص).
function ringDoseAlarm() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      [0, 0.5, 1, 1.5, 2].forEach((t) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.value = 0.3;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + t);
        osc.stop(ctx.currentTime + t + 0.3);
      });
      setTimeout(() => ctx.close(), 3000);
    }
  } catch (e) {
    /* الجهاز مش بيدعم الصوت - الإشعار والفايبريشن هيكفوا */
  }
  if (navigator.vibrate) {
    navigator.vibrate([400, 200, 400, 200, 400, 200, 400]);
  }
}

// tone بيحدد لون دايرة الأيقونة - بنغلّفها في خلفية موحّدة المقاس واللون بدل ما نسيب
// شكل الإيموجي الخام (اللي بيختلف كتير من نوع لنوع - بعضها ملوّن وبعضها فلات) يبان متلخبط
const ISSUE_OPTIONS = [
  { key: 'forgot_dose', icon: '🕐', label: 'نسيت آخد جرعة', tone: 'blue' },
  { key: 'med_finished', icon: '💊', label: 'الدوا خلص', tone: 'amber' },
  { key: 'unclear_dose', icon: '❓', label: 'مش فاهم إزاي آخده', tone: 'purple' },
  { key: 'side_effect', icon: '😣', label: 'حاسس بتعب بعد الدوا', tone: 'rose' },
  { key: 'other', icon: '⚠️', label: 'حاجة تانية', tone: 'gray' },
  { key: 'want_call', icon: '📞', label: 'عايز حد يكلمني', tone: 'danger', urgent: true },
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
  const [showIssue, setShowIssue] = React.useState(false);
  const [showSettings, setShowSettings] = React.useState(false);
  const [caregivers, setCaregivers] = React.useState([]);
  const [now, setNow] = React.useState(() => new Date());
  const [notifPermission, setNotifPermission] = React.useState(
    'Notification' in window ? Notification.permission : 'unsupported'
  );
  const [notifHelpOpen, setNotifHelpOpen] = React.useState(false);
  const notifiedDoseIds = React.useRef(new Set());

  // بيطلب صلاحية الإشعارات - لازم يتنادى من ضغطة مستخدم حقيقية (مش تلقائي لحظة فتح الصفحة)،
  // عشان متصفحات كتير بترفض/تتجاهل طلب صلاحية مش جاي من تفاعل مستخدم، وده كان بيخلي
  // زرار "تفعيل" يبان معطّل: الصلاحية بتترفض من غير ما حد يشوف نافذة الإذن أصلاً.
  // requestPermission بتترجع Promise في المتصفحات الحديثة، لكن بندعم صيغة الكولباك القديمة
  // كمان (Safari الأقدم) عشان الزرار يشتغل في كل الحالات.
  function requestNotifPermission() {
    if (!('Notification' in window)) return;
    // لو الصلاحية اتقفلت قبل كده، المتصفح مش هيوري نافذة تاني أصلاً - نوري إرشاد بدل زرار ميعملش حاجة
    if (Notification.permission === 'denied') {
      setNotifHelpOpen(true);
      return;
    }
    try {
      const result = Notification.requestPermission((perm) => setNotifPermission(perm));
      if (result && typeof result.then === 'function') {
        result.then(setNotifPermission).catch(() => setNotifPermission(Notification.permission));
      }
    } catch (e) {
      setNotifPermission(Notification.permission);
    }
  }

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getTodayDoses(user.id);
      setDoses(data.doses);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  React.useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
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

  // بمجرد ما جرعة توصل ميعادها، بننبّه المريض: إشعار + رنة + فايبريشن، مرة واحدة بس لكل جرعة
  React.useEffect(() => {
    doses.forEach((d) => {
      if (d.status !== 'pending') return;
      if (new Date(d.scheduled_at) > now) return;
      if (notifiedDoseIds.current.has(d.id)) return;
      notifiedDoseIds.current.add(d.id);

      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('معاك - وقت الدوا 💊', {
          body: `وقت ${d.name} دلوقتي`,
          tag: `dose-${d.id}`,
          vibrate: [400, 200, 400, 200, 400],
        });
      }
      if (alarmEnabled) ringDoseAlarm();
    });
  }, [doses, now, alarmEnabled]);

  async function handleTake(doseId) {
    try {
      await api.takeDose(doseId);
      load();
    } catch (e) {
      setError(e.message);
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
    if (d.status !== 'pending') return { ...d, isOpen: false, isLocked: false };
    const { isEarly, availableFrom } = getDoseAvailability(d.scheduled_at, now);
    return { ...d, isOpen: !isEarly, isLocked: isEarly, availableFrom };
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

  function speakDoseInfo() {
    let text;
    if (heroKind === 'open') {
      text =
        'معاد ' +
        heroDose.name +
        ' دلوقتي' +
        (heroDose.dosage ? '، الجرعة ' + heroDose.dosage : '') +
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
  function secondaryIcon(d) {
    if (d.status === 'taken') return '✅';
    if (d.status === 'missed') return '⚠️';
    if (d.isLocked) return '🕒';
    return '💊';
  }
  function secondaryMeta(d) {
    if (d.status === 'taken') return `اتاخدت - ${formatTime(d.scheduled_at)}`;
    if (d.status === 'missed') return `فاتت - ${formatTime(d.scheduled_at)}`;
    if (d.isLocked) return `هتفتح الساعة ${formatTimeObj(d.availableFrom)}`;
    return `الساعة ${formatTime(d.scheduled_at)}`;
  }

  const rootClassName = `patient-home${fontLarge ? ' font-large' : ''}${isNightBoost ? ' font-night' : ''}`;

  return (
    <div className={rootClassName}>
      <header className="patient-header">
        <span className="patient-greeting">أهلاً {firstName} 👋</span>
        <div className="patient-header-actions">
          <button
            className="patient-settings-btn"
            onClick={() => setShowSettings(true)}
            aria-label="الإعدادات"
            title="الإعدادات"
          >
            ⚙️
          </button>
          <button className="patient-logout" onClick={onLogout}>
            خروج
          </button>
        </div>
      </header>

      <main className="patient-main">
        <Banner onClose={() => setError('')}>{error}</Banner>
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
            <div className="patient-empty-icon">📭</div>
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
                  🔊
                </button>
                <div className="patient-hero-label">دلوقتي</div>
                <div className="patient-hero-icon">💊</div>
                <div className="patient-hero-name">{heroDose.name}</div>
                <div className="patient-hero-meta">الساعة {formatTime(heroDose.scheduled_at)}</div>
                {heroDose.dosage && <div className="patient-hero-meta">{heroDose.dosage}</div>}
                <button className="patient-hero-btn" onClick={() => handleTake(heroDose.id)}>
                  ✅ خدت الدوا
                </button>
              </div>
            )}

            {heroKind === 'waiting' && (
              <div className="patient-hero-card patient-hero-waiting">
                <button className="patient-hero-speak" onClick={speakDoseInfo} title="اسمع الدواء" aria-label="اسمع الدواء">
                  🔊
                </button>
                <div className="patient-hero-label muted">الجرعة الجاية</div>
                <div className="patient-hero-icon">🕒</div>
                <div className="patient-hero-name">{waitingDose.name}</div>
                <div className="patient-hero-meta">
                  هتقدر تأكدها الساعة {formatTimeObj(waitingDose.availableFrom)}
                </div>
              </div>
            )}

            {heroKind === 'allDone' && (
              <div className="patient-hero-card patient-hero-alldone">
                <div className="patient-hero-icon">🎉</div>
                <div className="patient-hero-name">خلصت كل جرعات النهارده</div>
              </div>
            )}

            {/* باقي جرعات النهارده - صفوف أصغر تحت الجرعة الرئيسية */}
            {secondaryDoses.length > 0 && (
              <React.Fragment>
                <div className="patient-secondary-title">باقي جرعات النهارده</div>
                <div className="patient-secondary-list">
                  {secondaryDoses.map((d) => (
                    <div key={d.id} className={`patient-secondary-row status-${d.status}`}>
                      <span className="patient-secondary-icon" aria-hidden="true">
                        {secondaryIcon(d)}
                      </span>
                      <div className="patient-secondary-body">
                        <div className="patient-secondary-name">{d.name}</div>
                        <div className="patient-secondary-meta">{secondaryMeta(d)}</div>
                      </div>
                      {d.isOpen && (
                        <button className="patient-secondary-take" onClick={() => handleTake(d.id)}>
                          ✅ خدت
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </React.Fragment>
            )}
          </div>
        )}

        {caregivers.length > 0 && (
          <div className="patient-caregiver-card">
            <div>
              <div className="patient-caregiver-label">متابعك</div>
              <div className="patient-caregiver-name">
                {caregivers[0].name}
                {caregivers.length > 1 && ` +${caregivers.length - 1} كمان`}
              </div>
            </div>
            <div className="patient-caregiver-avatar" aria-hidden="true">
              {caregivers[0].name.trim()[0] || 'م'}
            </div>
          </div>
        )}

        {isNightBoost && (
          <div className="patient-night-banner">
            <span aria-hidden="true">🌙</span>
            <span>وضع الليل: الخط أكبر شوية عشان الرؤية بالليل</span>
          </div>
        )}

        {notifPermission !== 'granted' && notifPermission !== 'unsupported' && (
          <div className={`patient-notif-banner${notifPermission === 'denied' ? ' patient-notif-banner-denied' : ''}`}>
            <span aria-hidden="true">{notifPermission === 'denied' ? '🔕' : '🔔'}</span>
            <div className="patient-notif-text">
              {notifPermission === 'denied' ? (
                <React.Fragment>
                  <div>التنبيهات موقوفة من إعدادات المتصفح</div>
                  {notifHelpOpen && (
                    <div className="patient-notif-help">
                      افتح إعدادات الموقع من المتصفح (دوس على 🔒 جنب عنوان الموقع فوق) وفعّل
                      "الإشعارات" من هناك، بعدين ارجع للتطبيق.
                    </div>
                  )}
                </React.Fragment>
              ) : (
                'فعّل التنبيهات عشان التطبيق يرن ويفكّرك بمواعيد دوائك'
              )}
            </div>
            <button
              className="patient-notif-btn"
              onClick={
                notifPermission === 'denied' ? () => setNotifHelpOpen((v) => !v) : requestNotifPermission
              }
            >
              {notifPermission === 'denied' ? (notifHelpOpen ? 'تمام' : 'إزاي؟') : 'تفعيل'}
            </button>
          </div>
        )}
      </main>

      <button className="patient-issue-btn" onClick={() => setShowIssue(true)}>
        ❗ حصلت مشكلة؟
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
          notifPermission={notifPermission}
          onRequestNotifPermission={requestNotifPermission}
          showPatientOptions={true}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

function IssueSheet({ patientId, medications, onClose }) {
  const [step, setStep] = React.useState('menu'); // menu | pick-med | sent
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState('');

  async function send(issueType, medicationName) {
    setSending(true);
    setError('');
    try {
      await api.reportIssue(patientId, issueType, medicationName);
      setStep('sent');
      setTimeout(onClose, 2500);
    } catch (e) {
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
            <div className="issue-sent-icon">
              <span aria-hidden="true">✅</span>
            </div>
            <p>تمام، وصل خبر لـ اللي بيتابعك</p>
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
                  <span className="issue-option-icon tone-amber">💊</span>
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
            <div className="issue-grid">
              {ISSUE_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  className={`issue-option${opt.urgent ? ' issue-option-urgent' : ''}`}
                  disabled={sending}
                  onClick={() => handlePick(opt.key)}
                >
                  <span className={`issue-option-icon tone-${opt.tone}`}>{opt.icon}</span>
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
