/* ============================================
   MA3ak (معاك) - شاشة المريض
   تصميم مختلف تمامًا عن شاشة المتابع: حاجة واحدة بس على الشاشة
   (الأدوية اللي هياخدها النهارده)، وزرار كبير "حصلت مشكلة؟" بضغطة واحدة.
   من غير تابات، من غير قوائم، من غير خطوات.
   ============================================ */

// الزرار "خدت الدوا" مقفول لحد ما يفضل على ميعاد الجرعة ربع ساعة (مش قبل كده بكتير)،
// عشان المريض ما يأكدش جرعة قبل وقتها بساعات. بعد ما ميعادها يعدي، الباك إند بيحوّلها "فايتة"
// تلقائيًا (scheduler.js) فمفيش داعي نقفلها من بعد الميعاد كمان.
const DOSE_EARLY_MINUTES = 15;

function getDoseAvailability(scheduledAt, now) {
  const scheduled = new Date(scheduledAt);
  const availableFrom = new Date(scheduled.getTime() - DOSE_EARLY_MINUTES * 60000);
  return { availableFrom, isEarly: now < availableFrom };
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

const ISSUE_OPTIONS = [
  { key: 'med_finished', icon: '💊', label: 'الدوا خلص' },
  { key: 'forgot_dose', icon: '🕐', label: 'نسيت آخد جرعة' },
  { key: 'side_effect', icon: '😣', label: 'حاسس بتعب بعد الدوا' },
  { key: 'unclear_dose', icon: '❓', label: 'مش فاهم إزاي آخده' },
  { key: 'want_call', icon: '📞', label: 'عايز حد يكلمني' },
  { key: 'other', icon: '⚠️', label: 'حاجة تانية' },
];

function PatientHome({ user, onLogout }) {
  const [doses, setDoses] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [showIssue, setShowIssue] = React.useState(false);
  const [now, setNow] = React.useState(() => new Date());
  const [notifPermission, setNotifPermission] = React.useState(
    'Notification' in window ? Notification.permission : 'unsupported'
  );
  const notifiedDoseIds = React.useRef(new Set());

  function requestNotifPermission() {
    if (!('Notification' in window)) return;
    Notification.requestPermission().then(setNotifPermission);
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

  // بيحدّث "الوقت الحالي" بشكل مستقل عن تحميل البيانات، عشان زرار الجرعة يتفتح لوحده
  // بالثانية اللي يوصلها ميعادها من غير ما المريض يحتاج يقفل ويفتح التطبيق تاني
  React.useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(tick);
  }, []);

  // أول ما الصفحة تفتح، نجرب نطلب صلاحية الإشعارات لوحدنا (لو لسه ما سألناش قبل كده)
  React.useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(setNotifPermission);
    }
  }, []);

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
      ringDoseAlarm();
    });
  }, [doses, now]);

  async function handleTake(doseId) {
    try {
      await api.takeDose(doseId);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  const pending = doses.filter((d) => d.status === 'pending');
  const done = doses.filter((d) => d.status !== 'pending');
  const medicationNames = [...new Set(doses.map((d) => d.name))];
  const firstName = (user.name || '').trim().split(' ')[0] || user.name;

  return (
    <div className="patient-home">
      <header className="patient-header">
        <span className="patient-greeting">أهلاً {firstName} 👋</span>
        <button className="patient-logout" onClick={onLogout}>
          خروج
        </button>
      </header>

      <main className="patient-main">
        <Banner onClose={() => setError('')}>{error}</Banner>

        {notifPermission !== 'granted' && notifPermission !== 'unsupported' && (
          <div className="patient-notif-banner">
            <span aria-hidden="true">🔔</span>
            <span className="patient-notif-text">
              فعّل التنبيهات عشان التطبيق يرن ويفكّرك بمواعيد دوائك
            </span>
            <button className="patient-notif-btn" onClick={requestNotifPermission}>
              تفعيل
            </button>
          </div>
        )}

        {loading ? (
          <Spinner />
        ) : doses.length === 0 ? (
          <div className="patient-empty">
            <div className="patient-empty-icon">🎉</div>
            <p>معندكش أدوية دلوقتي</p>
          </div>
        ) : (
          <div className="patient-dose-list">
            {pending.map((d) => {
              const { isEarly, availableFrom } = getDoseAvailability(d.scheduled_at, now);
              return (
                <div key={d.id} className="patient-dose-card">
                  <div className="patient-dose-icon">💊</div>
                  <div className="patient-dose-info">
                    <div className="patient-dose-name">{d.name}</div>
                    <div className="patient-dose-time">الساعة {formatTime(d.scheduled_at)}</div>
                    {d.dosage && <div className="patient-dose-dosage">{d.dosage}</div>}
                  </div>
                  {isEarly ? (
                    <div className="patient-take-locked">
                      <span aria-hidden="true">🔒</span>
                      <span>الزرار يفتح الساعة {formatTime(availableFrom)}</span>
                    </div>
                  ) : (
                    <button className="patient-take-btn" onClick={() => handleTake(d.id)}>
                      ✅ خدت الدوا
                    </button>
                  )}
                </div>
              );
            })}

            {done.map((d) => (
              <div key={d.id} className="patient-dose-card patient-dose-done">
                <div className="patient-dose-icon">{d.status === 'taken' ? '✅' : '⚠️'}</div>
                <div className="patient-dose-info">
                  <div className="patient-dose-name">{d.name}</div>
                  <div className="patient-dose-time">
                    {d.status === 'taken' ? 'اتاخدت' : 'فاتت'} - {formatTime(d.scheduled_at)}
                  </div>
                </div>
              </div>
            ))}
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
        {step === 'sent' ? (
          <div className="issue-sent">
            <div className="issue-sent-icon">✅</div>
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
                  <span className="issue-option-icon">💊</span>
                  <span>{m}</span>
                </button>
              ))}
            </div>
            <button className="issue-back" onClick={() => setStep('menu')}>
              رجوع
            </button>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <h3 className="issue-title">حصل إيه؟</h3>
            <Banner onClose={() => setError('')}>{error}</Banner>
            <div className="issue-grid">
              {ISSUE_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  className="issue-option"
                  disabled={sending}
                  onClick={() => handlePick(opt.key)}
                >
                  <span className="issue-option-icon">{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
            <button className="issue-close" onClick={onClose}>
              إلغاء
            </button>
          </React.Fragment>
        )}
      </div>
    </div>
  );
}
