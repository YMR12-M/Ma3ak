/* ============================================
   MA3ak (معاك) - شاشة "اليوم": جرعات الدوا النهارده
   ============================================ */

function TodayView({ patientId, onOpenAdherence }) {
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

  return (
    <div className="view">
      <h2 className="view-title">جرعات النهارده</h2>
      <Banner onClose={() => setError('')}>{error}</Banner>

      {doses.length > 0 && <DaySummary doses={doses} />}

      {doses.length === 0 && <EmptyState icon="pill" text="مفيش أدوية مسجلة النهارده" />}

      {pending.length > 0 && (
        <div className="dose-list stagger">
          {pending.map((d) => (
            <DoseTicket key={d.id} scheduledAt={d.scheduled_at} name={d.name} meta={d.dosage}>
              <Button
                onClick={() => handleTake(d.id)}
                aria-label={`تسجيل جرعة ${d.name} الساعة ${formatTime(d.scheduled_at)} كمتناولة`}
              >
                <Icon name="check" size={20} strokeWidth={2.6} />
                اتاخد
              </Button>
            </DoseTicket>
          ))}
        </div>
      )}

      {done.length > 0 && (
        <React.Fragment>
          <h3 className="view-subtitle">تم تسجيلها</h3>
          <div className="dose-list stagger">
            {done.map((d) => (
              <DoseTicket key={d.id} scheduledAt={d.scheduled_at} name={d.name} meta={d.dosage} done>
                {/* الحالة بالختم: كلمة مكتوبة مش لون بس */}
                <Stamp tone={d.status === 'taken' ? 'green' : 'coral'} flip={d.status !== 'taken'}>
                  {d.status === 'taken' ? 'اتاخدت' : 'فاتت'}
                </Stamp>
              </DoseTicket>
            ))}
          </div>
        </React.Fragment>
      )}

      {/* مدخل تقرير الالتزام من المكان اللي المتابع بيبص فيه أصلاً.

          مبقاش تاب لوحده عن قصد: الشريط السفلي فيه 6 تابات بالفعل، والسابع
          كان هيخلي كل الأسامي تتقص على شاشة موبايل عادية - وده بيضر كل تاب
          مش بس الجديد. */}
      {onOpenAdherence && (
        <button className="adherence-entry" onClick={onOpenAdherence}>
          <span className="adherence-entry-icon" aria-hidden="true">
            <Icon name="pulse" size={22} />
          </span>
          <span className="adherence-entry-body">
            <span className="adherence-entry-title">تقرير الالتزام</span>
            <span className="adherence-entry-desc">نسبة الجرعات على مدى أسبوع أو شهر، وأنهي ميعاد بيتنسى</span>
          </span>
          <Icon name="chevron" size={18} strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
}

/* ============================================
   لوحة ملخّص اليوم
   ============================================
   بتجاوب على سؤال المتابع الأول قبل ما يسأله: "خلصنا كام وفاضل كام؟".
   قبل كده الشاشة كانت بتبدأ بقايمة كروت على طول، فالإجابة كانت محتاجة إن
   المتابع يعدّ بعينه - وده بالظبط النوع من الشغل اللي المفروض التطبيق
   يشيله عنه.

   فيها نتيجة اليوم (التاريخ)، وشريط الدوا: فقاعة لكل جرعة بحالتها، والجرعة
   اللي ميعادها جه ومحدش سجّلها بتنبض - نفس الشريط اللي بيشوفه المريض.
   ============================================ */

function DaySummary({ doses }) {
  const total = doses.length;
  const taken = doses.filter((d) => d.status === 'taken').length;
  const missed = doses.filter((d) => d.status === 'missed').length;
  const left = doses.filter((d) => d.status === 'pending').length;
  const allDone = total > 0 && left === 0 && missed === 0;

  let meta;
  if (allDone) meta = 'تمام، كل جرعات النهارده اتاخدت.';
  else if (left > 0) meta = `فاضل ${left} ${left === 1 ? 'جرعة' : 'جرعات'} النهارده.`;
  else meta = 'مفيش جرعات مستنية دلوقتي.';

  /* فقاعة لكل جرعة. "open" لأول جرعة معلّقة ميعادها جه (مش بدري عليها) - هي اللي
     المفروض حد يسأل عنها دلوقتي. نفس منطق getDoseAvailability بتاع شاشة المريض. */
  const nowDate = new Date();
  let openAssigned = false;
  const items = doses.map((d) => {
    let state = d.status === 'taken' ? 'taken' : d.status === 'missed' ? 'missed' : 'locked';
    if (state === 'locked' && !openAssigned && !getDoseAvailability(d.scheduled_at, nowDate).isEarly) {
      state = 'open';
      openAssigned = true;
    }
    return {
      id: d.id,
      state,
      part: dayPartOfTime(d.scheduled_at).key,
      label: `${d.name} ${formatTime(d.scheduled_at)} - ${
        d.status === 'taken' ? 'اتاخدت' : d.status === 'missed' ? 'فاتت' : 'لسه'
      }`,
    };
  });

  return (
    <div className={`day-summary${allDone ? ' is-complete' : ''}`}>
      <CalendarLeaf date={nowDate} size={14} />

      <div className="day-summary-body">
        <div className="day-summary-title">{allDone ? 'خلصت النهارده' : 'متابعة اليوم'}</div>
        <div className="day-summary-meta">{meta}</div>
        <BlisterStrip items={items} label={`${taken} من ${total} جرعات اتاخدت`} />

        {/* الأرقام التلاتة مكررة للشريط فوق وللجملة - aria-hidden عشان قارئ الشاشة
            ميقراهمش مرتين (الشريط بيقرا كل جرعة بحالتها). */}
        <div className="day-summary-stats" aria-hidden="true">
          <div className="day-stat tone-done">
            <span className="day-stat-value">{taken}</span>
            اتاخدت
          </div>
          <div className="day-stat tone-left">
            <span className="day-stat-value">{left}</span>
            مستنية
          </div>
          <div className="day-stat tone-missed">
            <span className="day-stat-value">{missed}</span>
            فاتت
          </div>
        </div>
      </div>
    </div>
  );
}
