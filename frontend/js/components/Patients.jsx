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
        <Button onClick={() => setShowAddForm(true)}>
          <Icon name="plus" size={20} strokeWidth={2.4} />
          إضافة مريض جديد
        </Button>
      </div>

      <Banner onClose={() => setError('')}>{error}</Banner>

      {patients.length === 0 ? (
        <EmptyState icon="users" text="لسه معندكش مريض. ضيف أول واحد وابعتله اللينك." />
      ) : (
        <div className="med-list stagger">
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
  const [showManage, setShowManage] = React.useState(false);
  const [current, setCurrent] = React.useState(patient);
  const [regenerating, setRegenerating] = React.useState(false);

  /* حالة تنبيهات المريض.

     دي كانت أكبر فجوة منطقية في النظام كله: المتابع بيجهّز كل حاجة، والتنبيه
     بيروح **لجهاز مش في إيده**. مكانش عنده أي مؤشر إن موبايل المريض مسجّل
     اشتراك أصلاً - فكان مطمّن إن النظام شغال، ويكتشف العكس يوم ما جرعة مهمة
     تفوت من غير ما حد يعرف. وده بالظبط الفشل اللي التطبيق موجود عشان يمنعه. */
  const [notifStatus, setNotifStatus] = React.useState(null);
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState('');

  React.useEffect(() => {
    let alive = true;
    api
      .getPatientNotificationStatus(current.id)
      .then((data) => alive && setNotifStatus(data))
      .catch(() => {
        /* صامت - الشارة ببساطة مش هتبان */
      });
    return () => {
      alive = false;
    };
  }, [current.id]);

  async function handleTestAlarm() {
    setTesting(true);
    setTestResult('');
    try {
      await api.testPatientAlarm(current.id);
      setTestResult('بعتنا تنبيه لموبايل المريض - اتأكد إنه وصله');
    } catch (e) {
      setTestResult(e.message);
    } finally {
      setTesting(false);
    }
  }

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
        {current.link_code && (
          <div className="med-notes share-code-row">
            كود المشاركة:
            <span className="share-code">{current.link_code}</span>
          </div>
        )}

        {notifStatus && (
          <div className={`notif-status notif-status-${notifStatus.ok ? 'ok' : 'off'}`}>
            <Icon name={notifStatus.ok ? 'bell' : 'bellOff'} size={17} />
            <span>
              {notifStatus.ok
                ? `التنبيهات شغالة على ${notifStatus.deviceCount} جهاز`
                : !notifStatus.serverPushEnabled
                  ? 'خدمة التنبيهات مش مفعّلة على السيرفر'
                  : notifStatus.deviceCount === 0
                    ? 'المريض لسه مفعّلش التنبيهات على موبايله'
                    : 'المريض قافل التنبيهات من إعداداته'}
            </span>
            {notifStatus.deviceCount > 0 && (
              <button className="notif-status-test" onClick={handleTestAlarm} disabled={testing}>
                {testing ? '...' : 'جرّب'}
              </button>
            )}
          </div>
        )}
        {testResult && <div className="notif-status-result">{testResult}</div>}
      </div>
      {/* كلاس تاني (patient-link-actions) بس لتصغير الحشو/الخط شوية هنا - الزرارين كانوا
          بيتلفوا على سطرين على موبايل ضيق لأن نصهم أطول من "تعديل"/"إيقاف" العادية */}
      <div className="med-actions patient-link-actions">
        <Button variant="ghost" aria-label={`عرض لينك دخول ${current.name}`} onClick={() => setShowShare(true)}>
          <Icon name="link" size={17} />
          لينك الدخول
        </Button>
        <Button
          variant="ghost"
          aria-label={`توليد لينك دخول جديد لـ ${current.name}`}
          onClick={handleRegenerate}
          disabled={regenerating}
        >
          {regenerating ? (
            '...'
          ) : (
            <React.Fragment>
              <Icon name="refresh" size={17} />
              لينك جديد
            </React.Fragment>
          )}
        </Button>
        <Button variant="ghost" aria-label={`إدارة ${current.name}`} onClick={() => setShowManage(true)}>
          <Icon name="settings" size={17} />
          إدارة
        </Button>
      </div>
      {showShare && <ShareLinkModal patient={current} onClose={() => setShowShare(false)} />}
      {showManage && (
        <ManagePatientModal
          patient={current}
          onClose={() => setShowManage(false)}
          onChanged={onChanged}
          onError={onError}
        />
      )}
    </Card>
  );
}

/* ============================================
   إدارة المريض: المتابعين، الخروج، والحذف

   مكانش فيه أي طريقة تشيل مريض ولا متابع. غير إنها فجوة في الاستخدام العادي
   (متابع انضم بالغلط، مريض توفّى)، دي كمان **فجوة أمنية**: بعد ما حد ينضم
   بكود المشاركة، مكانش قدامك أي طريقة تخرجه.
   ============================================ */

function ManagePatientModal({ patient, onClose, onChanged, onError }) {
  const [caregivers, setCaregivers] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [confirmDelete, setConfirmDelete] = React.useState('');

  const load = React.useCallback(() => {
    api
      .getCaregivers(patient.id)
      .then((data) => setCaregivers(data.caregivers || []))
      .catch((e) => setError(e.message));
  }, [patient.id]);

  React.useEffect(load, [load]);

  async function run(fn, after) {
    setBusy(true);
    setError('');
    try {
      await fn();
      if (after) after();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const isLastCaregiver = caregivers.length <= 1;

  return (
    <Modal
      icon="users"
      tone="gray"
      title={`إدارة ${patient.name}`}
      subtitle="مين بيتابعه، وإزاي تخرج أو تمسح بياناته"
      onClose={onClose}
      footer={(close) => <Button onClick={close}>تم</Button>}
    >
      <Banner onClose={() => setError('')}>{error}</Banner>

      <div className="settings-group-label">المتابعين</div>
      {caregivers.map((c) => (
        <div key={c.id} className="settings-row">
          <div>
            <div className="settings-row-title">{c.name}</div>
            {c.phone && <div className="settings-row-desc">{c.phone}</div>}
          </div>
          <Button
            variant="ghost"
            disabled={busy}
            aria-label={`شيل ${c.name} من متابعة ${patient.name}`}
            onClick={() => {
              if (!confirm(`تشيل ${c.name} من متابعة ${patient.name}؟`)) return;
              run(() => api.removeCaregiver(patient.id, c.id), load);
            }}
          >
            شيله
          </Button>
        </div>
      ))}

      <div className="settings-group-label">الخروج من المتابعة</div>
      <p className="settings-row-desc manage-desc">
        {isLastCaregiver
          ? 'انت آخر متابع - لو خرجت المريض هيفضل بياخد منبهات ومحدش شايف حالته. لو عايز تشيله بجد استخدم الحذف تحت.'
          : 'هتخرج انت بس، وباقي المتابعين هيكملوا عادي.'}
      </p>
      <Button
        variant="soft"
        disabled={busy || isLastCaregiver}
        onClick={() => {
          if (!confirm(`تخرج من متابعة ${patient.name}؟`)) return;
          run(() => api.leavePatient(patient.id), () => {
            onChanged();
            onClose();
          });
        }}
      >
        خروج من المتابعة
      </Button>

      <div className="settings-group-label settings-group-danger">حذف المريض نهائيًا</div>
      <p className="settings-row-desc manage-desc">
        هيمسح كل أدويته وجرعاته ومواعيده وقياساته - **من غير رجعة**. اكتب اسمه بالظبط عشان
        تأكد.
      </p>
      {/* كتابة الاسم مش تعقيد زيادة: زرار حذف ورا confirm عادي بيتداس بالغلط،
          والغلط هنا بيمسح تاريخ طبي كامل من غير أي طريقة استرجاع. */}
      <input
        className="manage-confirm-input"
        type="text"
        placeholder={patient.name}
        value={confirmDelete}
        onChange={(e) => setConfirmDelete(e.target.value)}
        aria-label="اكتب اسم المريض للتأكيد"
      />
      <Button
        variant="danger"
        disabled={busy || confirmDelete.trim() !== patient.name.trim()}
        onClick={() =>
          run(() => api.deletePatient(patient.id), () => {
            onChanged();
            onClose();
          })
        }
      >
        احذف {patient.name} وكل بياناته
      </Button>
    </Modal>
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
    <Modal
      icon="link"
      tone="primary"
      title={`لينك دخول ${patient.name}`}
      subtitle="لينك واحد بيدخّل المريض على طول - من غير تسجيل ولا باسورد"
      onClose={onClose}
      footer={(close) => (
        <React.Fragment>
          <Button type="button" variant="soft" onClick={close}>
            تم
          </Button>
          <Button onClick={copyLink} variant={copied ? 'accent' : 'primary'}>
            <Icon name={copied ? 'checkCircle' : 'copy'} size={19} />
            {copied ? 'اتنسخ' : 'نسخ اللينك'}
          </Button>
        </React.Fragment>
      )}
    >
      <p>
        ابعت اللينك ده لـ <strong>{patient.name}</strong> على واتساب أو أي رسالة. أول ما يدوس
        عليه هيدخل على طول جوه التطبيق، وهيلاقي كل حاجة انت جهزتهاله - من غير ما يعمل تسجيل أو
        يكتب أي باسورد.
      </p>
      <div className="link-code-box">
        <a className="share-link-text" href={link} target="_blank" rel="noopener noreferrer">
          {link}
        </a>
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
    <Modal
      icon="users"
      tone="primary"
      title="إضافة مريض جديد"
      subtitle="هتاخد لينك دخول تبعتهوله، ويفتحه يلاقي كل حاجة جاهزة"
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={(close) => (
        <React.Fragment>
          <Button type="button" variant="soft" onClick={close} disabled={saving}>
            إلغاء
          </Button>
          <Button type="submit" loading={saving}>
            {saving ? 'جاري الإضافة...' : 'إضافة المريض'}
          </Button>
        </React.Fragment>
      )}
    >
      <Banner onClose={() => setError('')}>{error}</Banner>
      <Field label="اسم المريض">
        <input required value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="رقم موبايل المريض (اختياري)">
        <input
          type="tel"
          inputMode="numeric"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="01xxxxxxxxx"
        />
      </Field>
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
    <Modal
      icon="link"
      tone="accent"
      title="الانضمام كمتابع لمريض موجود"
      subtitle="اطلب كود المشاركة من المتابع اللي ضاف المريض"
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={(close) => (
        <React.Fragment>
          <Button type="button" variant="soft" onClick={close} disabled={saving}>
            إلغاء
          </Button>
          <Button type="submit" loading={saving}>
            {saving ? 'جاري الانضمام...' : 'انضمام'}
          </Button>
        </React.Fragment>
      )}
    >
      <Banner onClose={() => setError('')}>{error}</Banner>
      <Field label="كود المشاركة">
        <input
          required
         
          className="code-input"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="مثال: A1B2C3"
        />
      </Field>
    </Modal>
  );
}
