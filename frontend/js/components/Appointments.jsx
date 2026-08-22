/* ============================================
   MA3ak (معاك) - المواعيد الطبية
   ============================================ */

function AppointmentsView({ patientId }) {
  const [appts, setAppts] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [showForm, setShowForm] = React.useState(false);
  const [editing, setEditing] = React.useState(null);

  const load = React.useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    try {
      const data = await api.getAppointments(patientId);
      setAppts(data.appointments);
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
    if (!confirm('متأكد إنك عايز تلغي الموعد ده؟')) return;
    try {
      await api.deleteAppointment(id);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  if (!patientId) {
    return <EmptyState icon="👤" text="لسه معندكش مريض مربوط." />;
  }

  const now = new Date();
  const upcoming = appts.filter((a) => new Date(a.appointment_at.replace(' ', 'T')) >= now);
  const past = appts.filter((a) => new Date(a.appointment_at.replace(' ', 'T')) < now);

  return (
    <div className="view">
      <div className="view-header">
        <h2 className="view-title">المواعيد</h2>
        <Button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
        >
          ➕ موعد جديد
        </Button>
      </div>

      <Banner onClose={() => setError('')}>{error}</Banner>

      {loading ? (
        <SkeletonCards count={3} />
      ) : appts.length === 0 ? (
        <EmptyState icon="📅" text="مفيش مواعيد مسجلة." />
      ) : (
        <React.Fragment>
          {upcoming.length > 0 && (
            <div className="dose-list stagger">
              {upcoming.map((a) => (
                <AppointmentCard
                  key={a.id}
                  appt={a}
                  onEdit={() => {
                    setEditing(a);
                    setShowForm(true);
                  }}
                  onDelete={() => handleDelete(a.id)}
                />
              ))}
            </div>
          )}

          {past.length > 0 && (
            <React.Fragment>
              <h3 className="view-subtitle">مواعيد سابقة</h3>
              <div className="dose-list">
                {past.map((a) => (
                  <AppointmentCard
                    key={a.id}
                    appt={a}
                    onEdit={() => {
                      setEditing(a);
                      setShowForm(true);
                    }}
                    onDelete={() => handleDelete(a.id)}
                  />
                ))}
              </div>
            </React.Fragment>
          )}
        </React.Fragment>
      )}

      {showForm && (
        <AppointmentForm
          patientId={patientId}
          appointment={editing}
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

function AppointmentCard({ appt, onEdit, onDelete }) {
  return (
    <Card className="appt-card">
      <div>
        <div className="appt-title">{appt.title}</div>
        {(appt.doctor_name || appt.location) && (
          <div className="appt-meta">
            {appt.doctor_name}
            {appt.doctor_name && appt.location ? ' - ' : ''}
            {appt.location}
          </div>
        )}
        <div className="appt-datetime">{formatDateTime(appt.appointment_at)}</div>
        {appt.notes && <div className="med-notes">{appt.notes}</div>}
      </div>
      <div className="med-actions">
        <Button variant="ghost" aria-label={`تعديل موعد ${appt.title}`} onClick={onEdit}>
          تعديل
        </Button>
        <Button variant="danger" aria-label={`حذف موعد ${appt.title}`} onClick={onDelete}>
          حذف
        </Button>
      </div>
    </Card>
  );
}

function AppointmentForm({ patientId, appointment, onClose, onSaved }) {
  const isEdit = !!appointment;
  const [title, setTitle] = React.useState(appointment ? appointment.title : '');
  const [doctorName, setDoctorName] = React.useState(appointment ? appointment.doctor_name || '' : '');
  const [location, setLocation] = React.useState(appointment ? appointment.location || '' : '');
  const [appointmentAt, setAppointmentAt] = React.useState(
    toDatetimeLocalValue(appointment ? appointment.appointment_at : null)
  );
  const [notes, setNotes] = React.useState(appointment ? appointment.notes || '' : '');
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        patientId,
        title,
        doctorName,
        location,
        appointmentAt: appointmentAt.replace('T', ' ') + ':00',
        notes,
      };
      if (isEdit) await api.updateAppointment(appointment.id, payload);
      else await api.addAppointment(payload);
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={isEdit ? 'تعديل الموعد' : 'موعد جديد'} onClose={onClose}>
      <Banner onClose={() => setError('')}>{error}</Banner>
      <form onSubmit={handleSubmit}>
        <Field label="عنوان الموعد (مثال: كشف قلب)">
          <input required value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="اسم الدكتور">
          <input value={doctorName} onChange={(e) => setDoctorName(e.target.value)} />
        </Field>
        <Field label="المكان">
          <input value={location} onChange={(e) => setLocation(e.target.value)} />
        </Field>
        <Field label="التاريخ والوقت">
          <input
            type="datetime-local"
            required
            value={appointmentAt}
            onChange={(e) => setAppointmentAt(e.target.value)}
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
