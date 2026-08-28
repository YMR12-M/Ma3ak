/* ============================================
   MA3ak (معاك) - إدارة الأدوية
   ============================================ */

// ترتيب أيام الأسبوع مطابق لبتّات medications.days_of_week: بت 0 = الأحد.
// والأسبوع بيبدأ بالسبت في العرض؟ لأ - بيبدأ بالأحد عشان الترتيب البصري يطابق
// ترتيب البتّات، فمفيش أي تحويل بين الاتنين ومفيش مكان يغلط فيه.
const WEEKDAYS = ['الأحد', 'الإتنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/* وصف مقروء لأيام الدواء - بيبان في كارت الدواء في القايمة.
   من غيره المتابع مش هيعرف إن الدوا ده أسبوعي غير لما يفتح التعديل. */
function describeDays(mask) {
  const m = mask == null ? 127 : Number(mask);
  if (!Number.isFinite(m) || m <= 0 || m >= 127) return null; // كل يوم - مفيش داعي نقولها
  const days = WEEKDAYS.filter((_, i) => (m & (1 << i)) !== 0);
  if (days.length === 1) return `كل ${days[0]}`;
  return days.join('، ');
}

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
                  <div className="med-name">
                    {m.name}
                    {Boolean(m.is_critical) && (
                      <span className="med-critical-chip">
                        <Icon name="alert" size={13} strokeWidth={2.4} />
                        مواعيده مهمة
                      </span>
                    )}
                  </div>
                  {m.dosage && <div className="med-dosage">{m.dosage}</div>}
                  <div className="med-times">
                    {times.map((t) => (
                      <span key={t} className="chip">
                        <Icon name="clock" size={15} />
                        {t}
                      </span>
                    ))}
                    {/* الأيام بتبان بس لو مش "كل يوم" - إضافة شارة "كل يوم" على
                        كل دواء كانت هتزوّد ضجيج على القايمة من غير أي معلومة */}
                    {describeDays(m.days_of_week) && (
                      <span className="chip chip-days">
                        <Icon name="calendar" size={15} />
                        {describeDays(m.days_of_week)}
                      </span>
                    )}
                    {m.pills_left != null && (
                      <span className={`chip${m.pills_left <= times.length * 5 ? ' chip-low' : ''}`}>
                        <Icon name="pill" size={15} />
                        فاضل {m.pills_left}
                      </span>
                    )}
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
  /* الخصيصتين دول بيتحكموا في المنبه نفسه:
     isCritical    → الجرعة الفايتة بتتبعت للمتابع كتنبيه حرج (بيخترق ساعات
                     الهدوء)، والغفوة بتتقفل تلقائيًا.
     snoozeAllowed → المتابع يقدر يقفل الغفوة لدواء عادي كمان.
     الغفوة سلاح ذو حدين طبيًا - فيه أدوية توقيتها مش قابل للتأجيل أصلاً،
     وسيبها مفتوحة للكل معناه إن "فكّرني بعدين" تبقى طريقة مريحة لتفويت
     الجرعة بالكامل. */
  const [isCritical, setIsCritical] = React.useState(
    medication ? Boolean(medication.is_critical) : false
  );
  const [snoozeAllowed, setSnoozeAllowed] = React.useState(
    medication ? medication.snooze_allowed !== 0 : true
  );

  /* أيام الأسبوع كقناع 7 بت (بت 0 = الأحد ... بت 6 = السبت)، 127 = كل يوم.

     قبل العمود ده كل دواء في التطبيق كان **يومي بالضرورة**، فالأدوية الأسبوعية
     الشائعة عند نفس الجمهور ده (أليندرونات للعظام، ميثوتريكسات للروماتيزم،
     حقن ب12) مكانش قدام المتابع فيها غير اختيارين والاتنين غلط: يسجّلها يومي
     فالمريض يترنّ عليه كل يوم وتتحسب فايتة 6 مرات في الأسبوع، أو ميسجّلهاش. */
  const [daysMask, setDaysMask] = React.useState(
    medication && medication.days_of_week != null ? Number(medication.days_of_week) : 127
  );

  /* كمية الدوا الفاضلة. فاضي = المتابع مش عايز يتابع الكمية للدوا ده، وده
     الافتراضي - إجبار كل دواء على رقم كان هيحوّل إضافة دواء لشغل إضافي في كل مرة. */
  const [pillsLeft, setPillsLeft] = React.useState(
    medication && medication.pills_left != null ? String(medication.pills_left) : ''
  );

  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  /* صورة الدوا. بتتحفظ في طلب منفصل بعد ما الدواء نفسه يتحفظ - لأن الدواء
     الجديد ملوش id قبل كده أصلاً. والصورة بتتصغّر على الجهاز قبل الرفع
     (js/medImages.js): صورة كاميرا موبايل حديث 3-8 ميجا، ورفعها زي ما هي على
     بيانات موبايل بطيئة تجربة سيئة وممكن تفشل خالص. */
  const [imageDataUrl, setImageDataUrl] = React.useState(null);
  // اتغيّرت في الجلسة دي؟ الصورة القديمة بتتحمّل للعرض بس، ورفعها تاني زي ما
  // هي هيبعت مئات الكيلوبايتات من غير أي داعي مع كل تعديل في اسم الدوا
  const [imageChanged, setImageChanged] = React.useState(false);
  const [imageRemoved, setImageRemoved] = React.useState(false);
  const [imageBusy, setImageBusy] = React.useState(false);
  const fileInputRef = React.useRef(null);

  // صورة الدوا الموجودة (وقت التعديل) بتتحمّل من الكاش أو السيرفر
  React.useEffect(() => {
    if (!medication || !medication.has_image) return undefined;
    let alive = true;
    getMedImage(medication.id).then((url) => {
      if (alive && url) setImageDataUrl(url);
    });
    return () => {
      alive = false;
    };
  }, [medication]);

  async function handlePickImage(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // عشان اختيار نفس الملف تاني يشتغل
    if (!file) return;
    setImageBusy(true);
    setError('');
    try {
      setImageDataUrl(await resizeImageFile(file));
      setImageChanged(true);
      setImageRemoved(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setImageBusy(false);
    }
  }

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
      const payload = {
        patientId,
        name,
        dosage,
        notes,
        times,
        startDate,
        isCritical,
        snoozeAllowed,
        daysOfWeek: daysMask,
        // نص فاضي = "مش بتابع الكمية" (null)، مش صفر
        pillsLeft: pillsLeft === '' ? null : Number(pillsLeft),
      };
      const medId = isEdit
        ? (await api.updateMedication(medication.id, payload), medication.id)
        : (await api.addMedication(payload)).id;

      /* الصورة بتتحفظ بعد الدواء. لو فشلت، الدواء نفسه اتحفظ خلاص - فبنقول
         للمستخدم إن الصورة بس هي اللي مانفعتش بدل ما نخلّيه يفتكر إن كل
         التعديل ضاع ويعمله تاني. */
      try {
        if (imageRemoved && isEdit && medication.has_image) {
          await api.deleteMedicationImage(medId);
          clearMedImage(medId);
        } else if (imageChanged && imageDataUrl) {
          await api.setMedicationImage(medId, imageDataUrl);
          clearMedImage(medId); // الكاش القديم بقى قديم
        }
      } catch (imgError) {
        setError(`الدواء اتحفظ، بس الصورة مانفعتش: ${imgError.message}`);
        setSaving(false);
        return;
      }

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
          {/* القناع الفاضي بيترفض من السيرفر برسالة واضحة، بس مفيش داعي المتابع
              يملا الفورم كله ويستنى رحلة للسيرفر عشان يعرف - الزرار بيتقفل
              والتلميح تحت المنتقي بيقول السبب */}
          <Button type="submit" loading={saving} disabled={daysMask === 0}>
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

      {/* أيام الأسبوع. الافتراضي "كل يوم" وهو اللي بيغطي أغلب الأدوية، فالمتابع
          العادي مش هيلمس القسم ده خالص - بس اللي عنده دوا أسبوعي بقى قدامه طريقة. */}
      <FieldGroup label="أيام الجرعات">
        <div className="segmented">
          <button
            type="button"
            className={daysMask === 127 ? 'segmented-btn active' : 'segmented-btn'}
            onClick={() => setDaysMask(127)}
          >
            كل يوم
          </button>
          <button
            type="button"
            className={daysMask === 127 ? 'segmented-btn' : 'segmented-btn active'}
            // بيبدأ بيوم النهاردة مختار بدل ما يسيبه فاضي - القناع الفاضي
            // مرفوض من السيرفر، ومفيش سبب نخلي المتابع يقع فيه
            onClick={() => setDaysMask((m) => (m === 127 ? 1 << new Date().getDay() : m))}
          >
            أيام محددة
          </button>
        </div>

        {daysMask !== 127 && (
          <div className="weekday-picker">
            {WEEKDAYS.map((label, i) => {
              const on = (daysMask & (1 << i)) !== 0;
              return (
                <button
                  key={i}
                  type="button"
                  className={`weekday-btn${on ? ' active' : ''}`}
                  aria-pressed={on}
                  onClick={() => setDaysMask((m) => m ^ (1 << i))}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
        {daysMask !== 127 && daysMask === 0 && (
          <div className="field-hint field-hint-warn">اختار يوم واحد على الأقل</div>
        )}
      </FieldGroup>

      <Field label="تاريخ البداية">
        <input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </Field>

      {/* كمية الدوا. اختيارية عن قصد - إجبار رقم على كل دواء كان هيحوّل إضافة
          دواء لشغل إضافي، والفايدة كلها للي بيحب يتابع. */}
      <Field label="عدد الأقراص الموجودة (اختياري)">
        <input
          type="number"
          inputMode="numeric"
          min="0"
          max="9999"
          placeholder="سيبه فاضي لو مش هتتابع الكمية"
          value={pillsLeft}
          onChange={(e) => setPillsLeft(e.target.value)}
        />
        <div className="field-hint">
          بينقص مع كل جرعة تتسجّل، وهنبعتلك تنبيه قبل ما يخلص بأيام - بدل ما تعرف
          بعد ما يخلص فعلاً
        </div>
      </Field>

      {/* صورة الشريط. كبار السن بيعرفوا الدوا بشكله ولونه مش باسمه العلمي -
          "كونكور 5" مش معلومة لحد بيبص على 6 علب متشابهة. */}
      <FieldGroup label="صورة الدوا (اختياري)">
        <div className="med-image-picker">
          {imageDataUrl && !imageRemoved ? (
            <React.Fragment>
              <img className="med-image med-image-preview" src={imageDataUrl} alt="صورة الدواء" />
              <button
                type="button"
                className="med-image-remove"
                onClick={() => {
                  setImageRemoved(true);
                  setImageChanged(false);
                  setImageDataUrl(null);
                }}
              >
                <Icon name="trash" size={17} />
                شيل الصورة
              </button>
            </React.Fragment>
          ) : (
            <button
              type="button"
              className="med-image-add"
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
              disabled={imageBusy}
            >
              <Icon name="plus" size={22} strokeWidth={2.2} />
              {imageBusy ? 'بنجهّز الصورة...' : 'صوّر الشريط أو اختار صورة'}
            </button>
          )}
          {/* capture بيفتح الكاميرا على طول على الموبايل بدل معرض الصور -
              المتابع غالبًا ماسك الشريط في إيده وهو بيضيف الدوا */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePickImage}
            hidden
          />
        </div>
      </FieldGroup>

      <div className="settings-row">
        <div>
          <div className="settings-row-title">دوا مواعيده مهمة</div>
          <div className="settings-row-desc">
            زي الأنسولين وأدوية القلب - التنبيه بيوصلك في أي وقت لو فاتت، والمريض
            مش هيقدر يأجّلها
          </div>
        </div>
        <Toggle on={isCritical} onChange={() => setIsCritical((v) => !v)} label="دوا مواعيده مهمة" />
      </div>

      {/* بيختفي لو الدوا "مهم" - الغفوة مقفولة أصلاً وقتها، وعرض مفتاح مش
          شغال جنب مفتاح شغّال بيلخبط أكتر ما بيوضّح */}
      {!isCritical && (
        <div className="settings-row">
          <div>
            <div className="settings-row-title">يسمح بـ "فكّرني بعدين"</div>
            <div className="settings-row-desc">
              المريض يقدر يأجّل التنبيه 10 دقايق، بحد أقصى 3 مرات
            </div>
          </div>
          <Toggle
            on={snoozeAllowed}
            onChange={() => setSnoozeAllowed((v) => !v)}
            label="يسمح بتأجيل التنبيه"
          />
        </div>
      )}
      <Field label="ملاحظات">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </Modal>
  );
}
