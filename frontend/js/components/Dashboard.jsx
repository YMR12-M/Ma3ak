/* ============================================
   MA3ak (معاك) - شاشة "اليوم": جرعات الدوا النهارده
   ============================================ */

function TodayView({ patientId }) {
  const [doses, setDoses] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  const load = React.useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    try {
      const data = await api.getTodayDoses(patientId);
      setDoses(data.doses);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function handleTake(doseId) {
    try {
      await api.takeDose(doseId);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  if (!patientId) {
    return <EmptyState icon="users" text="لسه معندكش مريض. روح لتاب (المرضى) وضيف أول واحد." />;
  }
  if (loading) return <SkeletonCards count={3} />;

  const pending = doses.filter((d) => d.status === 'pending');
  const done = doses.filter((d) => d.status !== 'pending');
  const taken = doses.filter((d) => d.status === 'taken').length;
  const missed = doses.filter((d) => d.status === 'missed').length;

  return (
    <div className="view">
      <h2 className="view-title">جرعات النهارده</h2>
      <Banner onClose={() => setError('')}>{error}</Banner>

      {doses.length > 0 && (
        <DaySummary total={doses.length} taken={taken} missed={missed} left={pending.length} />
      )}

      {doses.length === 0 && <EmptyState icon="pill" text="مفيش أدوية مسجلة النهارده" />}

      {pending.length > 0 && (
        <div className="dose-list stagger">
          {pending.map((d) => (
            <Card key={d.id} className="dose-card">
              <div className="dose-info">
                <div className="dose-time">{formatTime(d.scheduled_at)}</div>
                <div>
                  <div className="dose-name">{d.name}</div>
                  {d.dosage && <div className="dose-dosage">{d.dosage}</div>}
                </div>
              </div>
              <Button
                onClick={() => handleTake(d.id)}
                aria-label={`تسجيل جرعة ${d.name} الساعة ${formatTime(d.scheduled_at)} كمتناولة`}
              >
                <Icon name="check" size={20} strokeWidth={2.4} />
                اتاخد
              </Button>
            </Card>
          ))}
        </div>
      )}

      {done.length > 0 && (
        <React.Fragment>
          <h3 className="view-subtitle">تم تسجيلها</h3>
          <div className="dose-list stagger">
            {done.map((d) => (
              <Card key={d.id} className="dose-card done">
                <div className="dose-info">
                  <div className="dose-time">{formatTime(d.scheduled_at)}</div>
                  <div>
                    <div className="dose-name">{d.name}</div>
                  </div>
                </div>
                <span className={`status-pill ${d.status}`}>
                  <Icon name={d.status === 'taken' ? 'checkCircle' : 'warning'} size={17} />
                  {d.status === 'taken' ? 'اتاخدت' : 'فاتت'}
                </span>
              </Card>
            ))}
          </div>
        </React.Fragment>
      )}
    </div>
  );
}

/* ============================================
   كارت ملخّص اليوم
   ============================================
   بيجاوب على سؤال المتابع الأول قبل ما يسأله: "خلصنا كام وفاضل كام؟".
   قبل كده الشاشة كانت بتبدأ بقايمة كروت على طول، فالإجابة كانت محتاجة إن
   المتابع يعدّ بعينه - وده بالظبط النوع من الشغل اللي المفروض التطبيق
   يشيله عنه.
   ============================================ */

function DaySummary({ total, taken, missed, left }) {
  // النسبة بتتبعت للـ CSS كمتغيّر، والحلقة بترسم نفسها بـ conic-gradient
  // (materials.css). كل حساب الرسم في CSS - هنا رقم واحد بس.
  const pct = total > 0 ? Math.round((taken / total) * 100) : 0;
  const allDone = total > 0 && left === 0 && missed === 0;

  let meta;
  if (allDone) meta = 'تمام، كل جرعات النهارده اتاخدت.';
  else if (left > 0) meta = `فاضل ${left} ${left === 1 ? 'جرعة' : 'جرعات'} النهارده.`;
  else meta = 'مفيش جرعات مستنية دلوقتي.';

  return (
    <div className={`day-summary${allDone ? ' is-complete' : ''}`}>
      <div
        className="progress-ring"
        style={{ '--progress': pct }}
        role="img"
        aria-label={`${taken} من ${total} جرعات اتاخدت`}
      >
        <span className="progress-ring-value">
          {taken}/{total}
        </span>
      </div>

      <div className="day-summary-body">
        <div className="day-summary-title">{allDone ? 'خلصت النهارده' : 'متابعة اليوم'}</div>
        <div className="day-summary-meta">{meta}</div>
      </div>

      {/* الأرقام أخت لكتلة النص مش جواها: كده على الشاشة الكبيرة تقدر تروح لطرف
          الكارت التاني وتوازنه، وعلى الموبايل بتلف لسطر تحتيه (CSS بس).
          aria-hidden لأن كل رقم فيها متقال بالفعل في نص الحلقة وفي السطر اللي
          فوق - تكراره لقارئ الشاشة هيبقى ضوضاء مش معلومة. */}
      <div className="day-summary-stats" aria-hidden="true">
        <span className="day-stat tone-done">
          <Icon name="checkCircle" size={15} />
          <span className="day-stat-value">{taken}</span> اتاخدت
        </span>
        {left > 0 && (
          <span className="day-stat tone-left">
            <Icon name="clock" size={15} />
            <span className="day-stat-value">{left}</span> مستنية
          </span>
        )}
        {missed > 0 && (
          <span className="day-stat tone-missed">
            <Icon name="warning" size={15} />
            <span className="day-stat-value">{missed}</span> فاتت
          </span>
        )}
      </div>
    </div>
  );
}
