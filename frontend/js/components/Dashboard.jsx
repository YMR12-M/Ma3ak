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
    return <EmptyState icon="🧓" text="لسه معندكش مريض. روح لتاب (المرضى) وضيف أول واحد." />;
  }
  if (loading) return <Spinner />;

  const pending = doses.filter((d) => d.status === 'pending');
  const done = doses.filter((d) => d.status !== 'pending');

  return (
    <div className="view">
      <h2 className="view-title">جرعات النهارده</h2>
      <Banner onClose={() => setError('')}>{error}</Banner>

      {doses.length === 0 && <EmptyState icon="💊" text="مفيش أدوية مسجلة النهارده" />}

      {pending.length > 0 && (
        <div className="dose-list">
          {pending.map((d) => (
            <Card key={d.id} className="dose-card">
              <div className="dose-info">
                <div className="dose-time">{formatTime(d.scheduled_at)}</div>
                <div>
                  <div className="dose-name">{d.name}</div>
                  {d.dosage && <div className="dose-dosage">{d.dosage}</div>}
                </div>
              </div>
              <Button onClick={() => handleTake(d.id)}>✅ اتاخد</Button>
            </Card>
          ))}
        </div>
      )}

      {done.length > 0 && (
        <React.Fragment>
          <h3 className="view-subtitle">تم تسجيلها</h3>
          <div className="dose-list">
            {done.map((d) => (
              <Card key={d.id} className="dose-card done">
                <div className="dose-info">
                  <div className="dose-time">{formatTime(d.scheduled_at)}</div>
                  <div>
                    <div className="dose-name">{d.name}</div>
                  </div>
                </div>
                <span className={`status-pill ${d.status}`}>
                  {d.status === 'taken' ? '✅ اتاخدت' : '⚠️ فاتت'}
                </span>
              </Card>
            ))}
          </div>
        </React.Fragment>
      )}
    </div>
  );
}
