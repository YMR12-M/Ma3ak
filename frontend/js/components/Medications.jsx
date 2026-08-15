/* ============================================
   MA3ak (معاك) - إدارة الأدوية
   ============================================ */

function MedicationsView({ patientId }) {
  const [meds, setMeds] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [showForm, setShowForm] = React.useState(false);
  const [editing, setEditing] = React.useState(null);

  const load = React.useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    try {
      const data = await api.getMedications(patientId);
      setMeds(data.medications);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(id) {
    if (!confirm('متأكد إنك عايز توقف الدواء ده؟')) return;
    try {
      await api.deleteMedication(id);
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
        <h2 className="view-title">الأدوية</h2>
        <Button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
        >
          ➕ دواء جديد
        </Button>
      </div>

      <Banner onClose={() => setError('')}>{error}</Banner>

      {loading ? (
        <Spinner />
      ) : meds.length === 0 ? (
        <EmptyState icon="💊" text="مفيش أدوية مسجلة، ضيف أول دواء." />
      ) : (
        <div className="med-list">
          {meds.map((m) => {
            const times = typeof m.times === 'string' ? JSON.parse(m.times) : m.times;
            return (
              <Card key={m.id} className="med-card">
                <div className="med-main">
                  <div className="med-name">{m.name}</div>
                  {m.dosage && <div className="med-dosage">{m.dosage}</div>}
                  <div className="med-times">
                    {times.map((t) => (
                      <span key={t} className="chip">
                        {t}
                      </span>
                    ))}
                  </div>
                  {m.notes && <div className="med-notes">{m.notes}</div>}
                </div>
                <div className="med-actions">
                  <Button
                    variant="ghost"
                    aria-label={`تعديل دواء ${m.name}`}
                    onClick={() => {
                      setEditing(m);
                      setShowForm(true);
                    }}
                  >
                    تعديل
                  </Button>
                  <Button variant="danger" aria-label={`إيقاف دواء ${m.name}`} onClick={() => handleDelete(m.id)}>
                    إيقاف
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {showForm && (
        <MedicationForm
          patientId={patientId}
          medication={editing}
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

function MedicationForm({ patientId, medication, onClose, onSaved }) {
  const isEdit = !!medication;
  const [name, setName] = React.useState(medication ? medication.name : '');
  const [dosage, setDosage] = React.useState(medication ? medication.dosage || '' : '');
  const [notes, setNotes] = React.useState(medication ? medication.notes || '' : '');
  const [times, setTimes] = React.useState(
    medication
      ? typeof medication.times === 'string'
        ? JSON.parse(medication.times)
        : medication.times
      : ['08:00']
  );
  const [startDate, setStartDate] = React.useState(
    medication ? medication.start_date : new Date().toISOString().slice(0, 10)
  );
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  function updateTime(i, value) {
    const next = [...times];
    next[i] = value;
    setTimes(next);
  }

  function addTime() {
    setTimes([...times, '08:00']);
  }

  function removeTime(i) {
    setTimes(times.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = { patientId, name, dosage, notes, times, startDate };
      if (isEdit) await api.updateMedication(medication.id, payload);
      else await api.addMedication(payload);
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={isEdit ? 'تعديل الدواء' : 'دواء جديد'} onClose={onClose}>
      <Banner onClose={() => setError('')}>{error}</Banner>
      <form onSubmit={handleSubmit}>
        <Field label="اسم الدواء">
          <input required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="الجرعة (مثال: قرص واحد)">
          <input value={dosage} onChange={(e) => setDosage(e.target.value)} />
        </Field>
        <Field label="مواعيد الجرعات">
          <div className="times-list">
            {times.map((t, i) => (
              <div key={i} className="time-row">
                <input
                  type="time"
                  aria-label={`ميعاد الجرعة رقم ${i + 1}`}
                  value={t}
                  onChange={(e) => updateTime(i, e.target.value)}
                />
                {times.length > 1 && (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`حذف ميعاد الجرعة رقم ${i + 1}`}
                    onClick={() => removeTime(i)}
                  >
                    🗑
                  </button>
                )}
              </div>
            ))}
            <Button type="button" variant="ghost" onClick={addTime}>
              ➕ إضافة معاد
            </Button>
          </div>
        </Field>
        <Field label="تاريخ البداية">
          <input
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </Field>
        <Field label="ملاحظات">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <Button type="submit" disabled={saving}>
          {saving ? 'جاري الحفظ...' : 'حفظ'}
        </Button>
      </form>
    </Modal>
  );
}
