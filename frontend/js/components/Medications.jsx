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
    return <EmptyState icon="user" text="لسه معندكش مريض مربوط." />;
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
          <Icon name="plus" size={20} strokeWidth={2.4} />
          دواء جديد
        </Button>
      </div>

      <Banner onClose={() => setError('')}>{error}</Banner>

      {loading ? (
        <SkeletonCards count={3} />
      ) : meds.length === 0 ? (
        <EmptyState icon="pill" text="مفيش أدوية مسجلة، ضيف أول دواء." />
      ) : (
        <div className="med-list stagger">
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
                        <Icon name="clock" size={15} />
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
    <Modal
      icon="pill"
      tone="primary"
      title={isEdit ? 'تعديل الدواء' : 'دواء جديد'}
      subtitle={
        isEdit
          ? 'التعديل بيسري على جرعات النهارده اللي لسه ميعادها مجاش'
          : 'اكتب اسمه ومواعيده، وإحنا هنفكّر المريض بيه في وقته'
      }
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={(close) => (
        <React.Fragment>
          <Button type="button" variant="soft" onClick={close} disabled={saving}>
            إلغاء
          </Button>
          <Button type="submit" loading={saving}>
            {saving ? 'جاري الحفظ...' : isEdit ? 'حفظ التعديل' : 'إضافة الدواء'}
          </Button>
        </React.Fragment>
      )}
    >
      <Banner onClose={() => setError('')}>{error}</Banner>

      <Field label="اسم الدواء">
        <input required value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="الجرعة (مثال: قرص واحد)">
        <input value={dosage} onChange={(e) => setDosage(e.target.value)} />
      </Field>

      {/* FieldGroup مش Field: جوه المجموعة دي أكتر من عنصر + زرار، و<label>
          حواليهم كانت بتفتح ساعة أول جرعة لما حد يدوس على العنوان */}
      <FieldGroup label="مواعيد الجرعات">
        <div className="times-list">
          {times.map((t, i) => (
            <div key={i} className="time-row">
              <span className="time-row-index" aria-hidden="true">
                {i + 1}
              </span>
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
                  <Icon name="trash" size={20} />
                </button>
              )}
            </div>
          ))}
          <Button type="button" variant="ghost" onClick={addTime}>
            <Icon name="plus" size={18} strokeWidth={2.4} />
            إضافة معاد
          </Button>
        </div>
      </FieldGroup>

      <Field label="تاريخ البداية">
        <input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </Field>
      <Field label="ملاحظات">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </Modal>
  );
}
