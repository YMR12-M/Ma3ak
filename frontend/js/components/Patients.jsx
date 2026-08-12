/* ============================================
   MA3ak (معاك) - إدارة المرضى (تبع المتابع بس)
   المتابع بيضيف المريض بنفسه ويجهزله كل حاجة، وبعدين بيبعتله
   "لينك دخول" واحد - المريض بيفتحه بس وبيدخل على طول من غير ما
   يعمل أي حاجة تانية (من غير تسجيل، من غير باسورد).
   ============================================ */

function buildAccessLink(token) {
  return `${window.location.origin}/access/${token}`;
}

function PatientsView({ patients, onChanged }) {
  const [error, setError] = React.useState('');
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [showJoinForm, setShowJoinForm] = React.useState(false);
  const [newPatientLink, setNewPatientLink] = React.useState(null);

  return (
    <div className="view">
      <div className="view-header">
        <h2 className="view-title">المرضى اللي بتتابعهم</h2>
        <Button onClick={() => setShowAddForm(true)}>➕ إضافة مريض جديد</Button>
      </div>

      <Banner onClose={() => setError('')}>{error}</Banner>

      {patients.length === 0 ? (
        <EmptyState icon="🧓" text="لسه معندكش مريض. ضيف أول واحد وابعتله اللينك." />
      ) : (
        <div className="med-list">
          {patients.map((p) => (
            <PatientCard key={p.id} patient={p} onError={setError} onChanged={onChanged} />
          ))}
        </div>
      )}

      <Card>
        <button className="link-like" onClick={() => setShowJoinForm(true)}>
          عندك كود مشاركة من مريض متابع بالفعل من حد تاني؟
        </button>
      </Card>

      {showAddForm && (
        <AddPatientForm
          onClose={() => setShowAddForm(false)}
          onCreated={(patient) => {
            setShowAddForm(false);
            setNewPatientLink(patient);
            onChanged();
          }}
        />
      )}

      {newPatientLink && (
        <ShareLinkModal patient={newPatientLink} onClose={() => setNewPatientLink(null)} />
      )}

      {showJoinForm && (
        <JoinPatientForm
          onClose={() => setShowJoinForm(false)}
          onJoined={() => {
            setShowJoinForm(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function PatientCard({ patient, onError, onChanged }) {
  const [showShare, setShowShare] = React.useState(false);
  const [current, setCurrent] = React.useState(patient);
  const [regenerating, setRegenerating] = React.useState(false);

  async function handleRegenerate() {
    if (!confirm('اللينك القديم هيبقى مش شغال. متأكد؟')) return;
    setRegenerating(true);
    try {
      const data = await api.regeneratePatientLink(current.id);
      setCurrent({ ...current, access_token: data.access_token });
      setShowShare(true);
    } catch (e) {
      onError(e.message);
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <Card className="med-card">
      <div className="med-main">
        <div className="med-name">{current.name}</div>
        {current.phone && <div className="med-dosage">{current.phone}</div>}
        {current.link_code && <div className="med-notes">كود المشاركة: {current.link_code}</div>}
      </div>
      <div className="med-actions">
        <Button variant="ghost" onClick={() => setShowShare(true)}>
          🔗 لينك الدخول
        </Button>
        <Button variant="ghost" onClick={handleRegenerate} disabled={regenerating}>
          {regenerating ? '...' : '🔄 لينك جديد'}
        </Button>
      </div>
      {showShare && (
        <ShareLinkModal patient={current} onClose={() => setShowShare(false)} />
      )}
    </Card>
  );
}

function ShareLinkModal({ patient, onClose }) {
  const [copied, setCopied] = React.useState(false);
  const [copyFailed, setCopyFailed] = React.useState(false);
  const link = buildAccessLink(patient.access_token);

  async function copyLink() {
    setCopyFailed(false);
    const ok = await copyText(link);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      setCopyFailed(true);
    }
  }

  return (
    <Modal title={`لينك دخول ${patient.name}`} onClose={onClose}>
      <p>
        ابعت اللينك ده لـ <strong>{patient.name}</strong> على واتساب أو أي رسالة. أول ما يدوس
        عليه هيدخل على طول جوه التطبيق، وهيلاقي كل حاجة انت جهزتهاله - من غير ما يعمل تسجيل أو
        يكتب أي باسورد.
      </p>
      <div className="link-code-box">
        <a className="share-link-text" href={link} target="_blank" rel="noopener noreferrer">
          {link}
        </a>
        <Button onClick={copyLink}>{copied ? '✅ اتنسخ' : '📋 نسخ اللينك'}</Button>
        {copyFailed && (
          <p className="copy-hint">
            معرفناش ننسخه تلقائيًا (بيحصل لو بتفتح التطبيق بعنوان مش localhost). دوس مطوّل على
            اللينك فوق واختار "نسخ" يدويًا، أو ابعت الصفحة دي بنفسها.
          </p>
        )}
      </div>
    </Modal>
  );
}

function AddPatientForm({ onClose, onCreated }) {
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const data = await api.createPatient({ name, phone: phone || undefined });
      onCreated(data.patient);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="إضافة مريض جديد" onClose={onClose}>
      <Banner onClose={() => setError('')}>{error}</Banner>
      <form onSubmit={handleSubmit}>
        <Field label="اسم المريض">
          <input required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="رقم موبايل المريض (اختياري)">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01xxxxxxxxx" />
        </Field>
        <Button type="submit" disabled={saving}>
          {saving ? 'جاري الإضافة...' : 'إضافة'}
        </Button>
      </form>
    </Modal>
  );
}

function JoinPatientForm({ onClose, onJoined }) {
  const [code, setCode] = React.useState('');
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.linkPatient(code.trim());
      onJoined();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="الانضمام كمتابع لمريض موجود" onClose={onClose}>
      <p>اطلب كود المشاركة من المتابع اللي ضاف المريض، هتلاقيه تحت كارت المريض.</p>
      <Banner onClose={() => setError('')}>{error}</Banner>
      <form onSubmit={handleSubmit}>
        <Field label="كود المشاركة">
          <input
            required
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="مثال: A1B2C3"
          />
        </Field>
        <Button type="submit" disabled={saving}>
          {saving ? 'جاري الانضمام...' : 'انضمام'}
        </Button>
      </form>
    </Modal>
  );
}
