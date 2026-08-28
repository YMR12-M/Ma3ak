/* ============================================
   MA3ak (معاك) - تقرير الالتزام

   البيانات دي كانت متسجّلة في جدول doses من أول يوم، ومحدش بيقراها: الواجهة
   كانت بتعرض النهاردة بس. التقرير هو اللي بيحوّل التطبيق من "مفكّرة" لحاجة
   تتاخد للدكتور.

   والحاجة اللي مفيش طريقة تانية حد يلاحظها: **النمط**. إن جرعة الصبح بتتاخد
   دايمًا وجرعة الليل بتتنسى نص المرات - ده مش رقم، ده معلومة بتغيّر القرار
   (ينقل الجرعة؟ يحط منبه تاني؟ يكلّمه بنفسه؟).
   ============================================ */

const ADHERENCE_RANGES = [
  { days: 7, label: 'أسبوع' },
  { days: 30, label: 'شهر' },
  { days: 90, label: '3 شهور' },
];

// فوق كده التزام كويس، تحت كده محتاج انتباه. الحد ده مش قاعدة طبية - هو بس
// عتبة لونية عشان المتابع ياخد باله بنظرة، والرقم نفسه ظاهر جنبه دايمًا.
const GOOD_RATE = 80;

function AdherenceView({ patientId, onBack }) {
  const [days, setDays] = React.useState(30);
  const [report, setReport] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!patientId) return undefined;
    let alive = true;
    setLoading(true);
    api
      .getAdherence(patientId, days)
      .then((data) => {
        if (alive) {
          setReport(data);
          setError('');
        }
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [patientId, days]);

  if (!patientId) {
    return <EmptyState icon="user" text="لسه معندكش مريض مربوط." />;
  }

  const rate = report && report.rate;
  const rateTone = rate === null || rate === undefined ? 'muted' : rate >= GOOD_RATE ? 'good' : 'warn';

  return (
    <div className="view">
      <div className="view-header">
        <h2 className="view-title">تقرير الالتزام</h2>
        {onBack && (
          <Button variant="ghost" onClick={onBack}>
            رجوع
          </Button>
        )}
      </div>

      <Banner onClose={() => setError('')}>{error}</Banner>

      <div className="segmented adherence-range">
        {ADHERENCE_RANGES.map((r) => (
          <button
            key={r.days}
            className={days === r.days ? 'segmented-btn active' : 'segmented-btn'}
            onClick={() => setDays(r.days)}
          >
            {r.label}
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonCards count={2} />
      ) : !report || report.total === 0 ? (
        <EmptyState icon="pill" text="مفيش جرعات متسجّلة في الفترة دي." />
      ) : (
        <React.Fragment>
          <Card className="adherence-summary">
            <div className={`adherence-rate adherence-rate-${rateTone}`}>
              <span className="adherence-rate-value">{rate}%</span>
              <span className="adherence-rate-label">التزام</span>
            </div>
            <div className="adherence-counts">
              <div className="adherence-count">
                <span className="adherence-count-value">{report.taken}</span>
                <span className="adherence-count-label">جرعة اتاخدت</span>
              </div>
              <div className="adherence-count adherence-count-missed">
                <span className="adherence-count-value">{report.missed}</span>
                <span className="adherence-count-label">جرعة فاتت</span>
              </div>
            </div>
          </Card>

          {/* الملاحظة دي هي أهم حاجة في الصفحة: رقم الالتزام بيقول "فيه مشكلة"،
              والسطر ده بيقول "المشكلة فين بالظبط". */}
          {report.worstTime && (
            <div className="adherence-insight">
              <span className="adherence-insight-icon" aria-hidden="true">
                <Icon name="clock" size={24} />
              </span>
              <div>
                <div className="adherence-insight-title">
                  جرعة {report.worstTime.label} هي أكتر واحدة بتتنسى
                </div>
                <div className="adherence-insight-desc">
                  فاتت {report.worstTime.missed} مرة من {report.worstTime.taken + report.worstTime.missed}
                </div>
              </div>
            </div>
          )}

          <div className="adherence-section-title">كل يوم</div>
          <Card className="adherence-days">
            {/* شريط بسيط لكل يوم: الأخضر اتاخد والأحمر فات. مفيش مكتبة رسم -
                نسب مئوية في CSS بتوصّل نفس المعلومة بصفر كيلوبايت زيادة. */}
            <div className="adherence-bars">
              {report.byDay.map((d) => {
                const total = d.taken + d.missed;
                return (
                  <div
                    key={d.day}
                    className="adherence-bar"
                    title={`${d.day}: ${d.taken} اتاخدت، ${d.missed} فاتت`}
                  >
                    <div className="adherence-bar-track">
                      <div
                        className="adherence-bar-taken"
                        style={{ height: `${total ? (d.taken / total) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="adherence-bar-label">{d.day.slice(8)}</span>
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="adherence-section-title">كل دواء</div>
          <Card className="adherence-meds">
            {report.byMedication.map((m) => {
              const total = m.taken + m.missed;
              const medRate = total ? Math.round((m.taken / total) * 100) : 0;
              return (
                <div key={m.id} className="adherence-med">
                  <div className="adherence-med-head">
                    <span className="adherence-med-name">{m.name}</span>
                    <span className={medRate >= GOOD_RATE ? 'adherence-med-rate' : 'adherence-med-rate warn'}>
                      {medRate}%
                    </span>
                  </div>
                  <div className="adherence-med-track">
                    <div className="adherence-med-fill" style={{ width: `${medRate}%` }} />
                  </div>
                  <div className="adherence-med-meta">
                    {m.taken} اتاخدت · {m.missed} فاتت
                  </div>
                </div>
              );
            })}
          </Card>

          {report.pendingNotCounted > 0 && (
            /* شفافية مقصودة: من غير السطر ده المتابع ممكن يعدّ الجرعات بنفسه
               ويلاقي الرقم مش مظبوط ويشك في التقرير كله */
            <p className="adherence-note">
              فيه {report.pendingNotCounted} جرعة لسه ميعادها مجاش - مش محسوبة في النسبة.
            </p>
          )}
        </React.Fragment>
      )}
    </div>
  );
}
