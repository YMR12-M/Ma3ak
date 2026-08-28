/* ============================================
   MA3ak (معاك) - شاشة المنبه

   لما ميعاد الجرعة ييجي والتطبيق مفتوح، ده اللي بيحصل: الشاشة بالكامل بتتحول
   للجرعة دي. مش بانر، مش صف في قايمة - الشاشة كلها.

   ليه كده مش إشعار عادي:
   المستخدم كبير سن، وممكن يكون بيبص على التليفون من مسافة، أو نظره ضعيف، أو
   مش حافظ التطبيق. حاجة واحدة بس على الشاشة، بخط كبير، وزرارين واضحين -
   ده اللي بيخلي الفعل يحصل. البانر الصغير جنب باقي المحتوى بيتقري كـ"معلومة"
   مش كـ"اعمل حاجة دلوقتي".

   الرنة بتفضل شغالة لحد ما المريض يتصرف (بحد أقصى، شوف ALARM_MAX_RINGS) -
   رنة واحدة بتفوت بسهولة على حد بيعمل حاجة تانية في البيت.
   ============================================ */

// الرنة بتتكرر كل كام ثانية، وكام مرة قبل ما تسكت لوحدها. الحد ده مقصود:
// منبه بيفضل يرن للأبد على حد نايم أو مش موجود في البيت بيتحول لإزعاج
// بيخلي المستخدم يقفل صوت التطبيق كله - وساعتها التنبيه المهم مش هيوصل.
const ALARM_RING_INTERVAL_MS = 7000;
const ALARM_MAX_RINGS = 6;

/* بيعمل "رنّاية" ليها start و stop.

   الصوت متولّد من Web Audio مش من ملف: مفيش تحميل، بيشتغل أوفلاين، ومفيش
   ملف صوت زيادة على مستخدم على بيانات موبايل بطيئة.

   AudioContext لازم يتقفل بعد الاستخدام - المتصفح بيحد عدد السياقات المفتوحة،
   ومن غير القفل الرنة بتبطّل تشتغل خالص بعد كام مرة. */
function createAlarmRinger() {
  let timer = null;
  let rings = 0;

  function playOnce() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        [0, 0.45, 0.9].forEach((t) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = 880;
          /* بنطلّع الصوت وننزّله بالتدريج بدل ما نفتحه ونقفله فجأة: القطع
             المفاجئ بيعمل "طقة" مسموعة (click) في كل مكبرات الصوت تقريبًا. */
          gain.gain.setValueAtTime(0.0001, ctx.currentTime + t);
          gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + t + 0.04);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.3);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime + t);
          osc.stop(ctx.currentTime + t + 0.32);
        });
        setTimeout(() => ctx.close().catch(() => {}), 2000);
      }
    } catch (e) {
      /* الجهاز مش بيدعم الصوت - الاهتزاز والشاشة هيكفوا */
    }
    if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]);
  }

  return {
    start() {
      if (timer) return; // شغالة بالفعل
      rings = 0;
      playOnce();
      rings += 1;
      timer = setInterval(() => {
        if (rings >= ALARM_MAX_RINGS) {
          this.stop();
          return;
        }
        playOnce();
        rings += 1;
      }, ALARM_RING_INTERVAL_MS);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      if (navigator.vibrate) navigator.vibrate(0); // بيوقّف أي اهتزاز شغال
    },
  };
}

/* شاشة المنبه. dose لازم يكون فيه أعمدة الدواء كمان (is_critical /
   snooze_allowed / snooze_count) عشان نعرف نعرض زرار الغفوة ولا لأ - نفس
   الشروط اللي السيرفر بيطبّقها (canSnoozeDose في doseLogic.js). */
function AlarmOverlay({ dose, onTake, onSnooze, onDismiss, busy, error, onSpeak }) {
  const snoozeAllowed = canSnoozeDose(dose);
  const snoozesLeft = MAX_SNOOZES - (dose.snooze_count || 0);

  /* Escape بيقفل شاشة المنبه (بتتحول لكارت عادي في الصفحة). مبنعملش focus trap
     زي الـ Modal عمدًا: دي مش نافذة المستخدم فتحها، دي حاجة ظهرت له - وحبس
     التركيز في حاجة ظهرت من نفسها بيحسّ المستخدم إنه اتقفل عليه. */
  React.useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onDismiss();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onDismiss]);

  const node = (
    <div className="alarm-overlay" role="alertdialog" aria-labelledby="alarm-title" aria-live="assertive">
      <div className={`alarm-card${dose.is_critical ? ' alarm-card-critical' : ''}`}>
        <div className="alarm-label">
          {dose.is_critical && (
            <span className="alarm-critical-chip">
              <Icon name="alert" size={15} strokeWidth={2.4} />
              دوا مهم
            </span>
          )}
          وقت الدوا دلوقتي
        </div>

        {/* صورة الشريط لو موجودة، وإلا الأيقونة النابضة. الصورة أوضح بكتير
            لحد بيبص على 6 علب متشابهة - الاسم العلمي مش هو اللي بيميّزها عنده.
            الدايرة بتنبض عشان العين تروح لها على طول، وبتقف تمامًا لو المستخدم
            مفعّل "تقليل الحركة" في نظامه (css/alarm.css) */}
        {dose.has_image ? (
          <div className="alarm-image-wrap">
            <MedImage
              medicationId={dose.medication_id}
              hasImage={dose.has_image}
              className="med-image-alarm"
            />
          </div>
        ) : (
          <div className="alarm-icon" aria-hidden="true">
            <span className="alarm-icon-pulse" />
            <Icon name="pill" size={64} strokeWidth={1.6} />
          </div>
        )}

        <h2 className="alarm-med-name" id="alarm-title">
          {dose.name}
        </h2>
        {dose.dosage && <div className="alarm-dosage">{dose.dosage}</div>}
        <div className="alarm-time">الساعة {formatTime(dose.scheduled_at)}</div>
        {/* تعليمات الدكتور - المكان الوحيد اللي المريض هيقراها فيه فعلاً */}
        {dose.notes && (
          <div className="alarm-notes">
            <Icon name="alert" size={18} strokeWidth={2.2} />
            {dose.notes}
          </div>
        )}

        {onSpeak && (
          <button className="alarm-speak" onClick={() => onSpeak(dose)} aria-label="اسمع الدواء">
            <Icon name="speaker" size={21} />
            اسمعه
          </button>
        )}

        <Banner onClose={undefined}>{error}</Banner>

        <button className="alarm-take" onClick={onTake} disabled={busy}>
          <Icon name="check" size={32} strokeWidth={2.7} />
          خدت الدوا
        </button>

        {snoozeAllowed ? (
          <button className="alarm-snooze" onClick={onSnooze} disabled={busy}>
            <Icon name="clock" size={21} />
            فكّرني بعد {SNOOZE_MINUTES} دقايق
            {snoozesLeft <= 1 && <span className="alarm-snooze-last"> (آخر مرة)</span>}
          </button>
        ) : (
          /* السبب بيتقال صراحة. زرار مختفي من غير تفسير بيخلي المستخدم يفتكر
             إن التطبيق بايظ - والسبب هنا قرار مقصود يستاهل يتشرح. */
          <div className="alarm-no-snooze">
            {dose.is_critical || !dose.snooze_allowed
              ? 'الدوا ده مواعيده مش بتتأجل'
              : `أجّلتها ${MAX_SNOOZES} مرات خلاص`}
          </div>
        )}

        <button className="alarm-dismiss" onClick={onDismiss} disabled={busy}>
          إغلاق مؤقت
        </button>
      </div>
    </div>
  );

  // برّه شجرة الشاشة خالص - نفس سبب الـ Modal (شوف Common.jsx)
  return ReactDOM.createPortal(node, document.body);
}
