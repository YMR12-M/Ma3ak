/* ============================================
   MA3ak (معاك) - القياسات الصحية
   ============================================ */

const VITAL_TYPES = [
  { key: 'blood_pressure', label: 'ضغط الدم', icon: '🩸' },
  { key: 'blood_sugar', label: 'السكر', icon: '🍬' },
  { key: 'weight', label: 'الوزن', icon: '⚖️' },
  { key: 'heart_rate', label: 'النبض', icon: '❤️' },
  { key: 'temperature', label: 'الحرارة', icon: '🌡️' },
];

function formatVitalValue(type, value) {
  if (type === 'blood_pressure') return `${value.systolic}/${value.diastolic}`;
  if (value && typeof value === 'object') return `${value.value}${value.unit ? ' ' + value.unit : ''}`;
  return String(value);
}

function VitalsView({ patientId }) {
  const [activeType, setActiveType] = React.useState('blood_pressure');
  const [vitals, setVitals] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [showForm, setShowForm] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    try {
      const data = await api.getVitals(patientId, activeType);
      setVitals(data.vitals);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [patientId, activeType]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(id) {
    if (!confirm('متأكد إنك عايز تمسح القياس ده؟')) return;
    try {
      await api.deleteVital(id);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  if (!patientId) {
    return <EmptyState icon="👤" text="لسه معندكش مريض مربوط." />;
  }

  return (
    <div className="view">
      <div className="view-header">
        <h2 className="view-title">القياسات الصحية</h2>
        <Button onClick={() => setShowForm(true)}>➕ قياس جديد</Button>
      </div>

      <Banner onClose={() => setError('')}>{error}</Banner>

      <div className="vital-type-grid" role="group" aria-label="نوع القياس المعروض">
        {VITAL_TYPES.map((t) => (
          <button
            key={t.key}
            className={activeType === t.key ? 'vital-type-btn active' : 'vital-type-btn'}
            aria-pressed={activeType === t.key}
            onClick={() => setActiveType(t.key)}
          >
            <div aria-hidden="true">{t.icon}</div>
            <div>{t.label}</div>
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : vitals.length === 0 ? (
        <EmptyState icon="🩺" text="مفيش قياسات مسجلة للنوع ده لسه." />
      ) : (
        <Card>
          {vitals.map((v) => {
            const value = typeof v.value_json === 'string' ? JSON.parse(v.value_json) : v.value_json;
            return (
              <div key={v.id} className="vital-row">
                <div>
                  <div className="vital-value">{formatVitalValue(v.type, value)}</div>
                  <div className="vital-date">{formatDateTime(v.recorded_at)}</div>
                </div>
                <button
                  className="icon-btn"
                  aria-label={`حذف قياس ${formatVitalValue(v.type, value)} بتاريخ ${formatDateTime(v.recorded_at)}`}
                  onClick={() => handleDelete(v.id)}
                >
                  🗑
                </button>
              </div>
            );
          })}
        </Card>
      )}

      {showForm && (
        <VitalForm
          patientId={patientId}
          defaultType={activeType}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function VitalForm({ patientId, defaultType, onClose, onSaved }) {
  const [type, setType] = React.useState(defaultType);
  const [systolic, setSystolic] = React.useState('');
  const [diastolic, setDiastolic] = React.useState('');
  const [value, setValue] = React.useState('');
  const [recordedAt, setRecordedAt] = React.useState(toDatetimeLocalValue(null));
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const unitByType = {
    blood_sugar: 'mg/dL',
    weight: 'كجم',
    heart_rate: 'نبضة/دقيقة',
    temperature: '°C',
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      let valueObj;
      if (type === 'blood_pressure') {
        if (!systolic || !diastolic) throw new Error('اكتب الرقمين');
        valueObj = { systolic: Number(systolic), diastolic: Number(diastolic) };
      } else {
        if (!value) throw new Error('اكتب القيمة');
        valueObj = { value: Number(value), unit: unitByType[type] };
      }
      await api.addVital({
        patientId,
        type,
        value: valueObj,
        recordedAt: recordedAt.replace('T', ' ') + ':00',
      });
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="قياس جديد" onClose={onClose}>
      <Banner onClose={() => setError('')}>{error}</Banner>
      <form onSubmit={handleSubmit}>
        <Field label="نوع القياس">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {VITAL_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>

        {type === 'blood_pressure' ? (
          <Field label="الانقباضي / الانبساطي">
            <div className="value-inputs">
              <input
                type="number"
                required
                placeholder="120"
                value={systolic}
                onChange={(e) => setSystolic(e.target.value)}
              />
              <input
                type="number"
                required
                placeholder="80"
                value={diastolic}
                onChange={(e) => setDiastolic(e.target.value)}
              />
            </div>
          </Field>
        ) : (
          <Field label={`القيمة ${unitByType[type] ? `(${unitByType[type]})` : ''}`}>
            <input type="number" required value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
        )}

        <Field label="وقت القياس">
          <input
            type="datetime-local"
            required
            value={recordedAt}
            onChange={(e) => setRecordedAt(e.target.value)}
          />
        </Field>

        <Button type="submit" disabled={saving}>
          {saving ? 'جاري الحفظ...' : 'حفظ'}
        </Button>
      </form>
    </Modal>
  );
}
