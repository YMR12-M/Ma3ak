/* ============================================
   MA3ak (معاك) - شاشة الإعدادات
   مشتركة بين المتابع والمريض.

   الإعدادات هنا نوعين مختلفين في المكان اللي بتتخزن فيه، والفرق مقصود:

     • المظهر وحجم الخط والرنة → على **الجهاز** (localStorage). كل جهاز
       بيحتفظ باختياره لوحده: موبايل المريض عايز خط كبير، لابتوب المتابع لأ.

     • تفضيلات التنبيهات → على **السيرفر** (notification_prefs). دي بتتبع
       الحساب مش المتصفح: المتابع اللي بيغيّر موبايله المفروض يلاقي إعداداته
       زي ما سابها، مش يرجع للافتراضي من غير ما يعرف - وميعرفش غير يوم ما
       تنبيه مهم ميوصلوش.
   ============================================ */

function SettingsSheet({
  darkMode,
  onSetDarkMode,
  fontLarge,
  onSetFontLarge,
  autoNightScale,
  onToggleAutoNightScale,
  alarmEnabled,
  onToggleAlarmEnabled,
  pushStatus,
  onPushStatusChange,
  showPatientOptions,
  onClose,
}) {
  const [notifHelpOpen, setNotifHelpOpen] = React.useState(false);
  const [prefs, setPrefs] = React.useState(null);
  const [prefsError, setPrefsError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [testResult, setTestResult] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);

  React.useEffect(() => {
    api
      .getNotificationPrefs()
      .then((data) => setPrefs(data.prefs))
      .catch(() => setPrefsError('مقدرناش نحمّل إعدادات التنبيهات'));
  }, []);

  /* بنحدّث الواجهة على طول وبعدين نبعت للسيرفر (optimistic): المستخدم بيدوس
     على مفتاح وبيتوقع يشوفه اتحرك حالًا، مش بعد رحلة للسيرفر. لو الطلب فشل
     بنرجّع القيمة زي ما كانت ونقول السبب - بدل ما نسيبه فاكر إنها اتحفظت. */
  async function savePref(patch) {
    const previous = prefs;
    setPrefs({ ...prefs, ...patch });
    setPrefsError('');
    try {
      await api.updateNotificationPrefs(patch);
    } catch (e) {
      setPrefs(previous);
      setPrefsError(e.message);
    }
  }

  async function handleEnablePush() {
    setBusy(true);
    setPrefsError('');
    try {
      await enablePush();
      onPushStatusChange(getPushStatus());
    } catch (e) {
      setPrefsError(e.message);
      onPushStatusChange(getPushStatus());
    } finally {
      setBusy(false);
    }
  }

  /* إشعار تجريبي. مش رفاهية: مفيش أي طريقة تانية المستخدم يتأكد بيها إن
     التنبيه هيوصله فعلاً على الجهاز ده - والبديل إنه يكتشف إنه مش شغال يوم
     ما جرعة مهمة تفوت. */
  async function handleTest() {
    setBusy(true);
    setTestResult('');
    try {
      await api.sendTestPush();
      setTestResult('بعتنا تنبيه تجريبي - لو مجاش خلال ثواني، التنبيهات مش شغالة على الجهاز ده');
    } catch (e) {
      setTestResult(e.message);
    } finally {
      setBusy(false);
    }
  }

  const quietOn = Boolean(prefs && prefs.quiet_start && prefs.quiet_end);

  return (
    <Modal
      icon="settings"
      tone="gray"
      title="الإعدادات"
      subtitle="المظهر محفوظ على الجهاز ده، والتنبيهات محفوظة على حسابك"
      onClose={onClose}
      footer={(close) => <Button onClick={close}>تم</Button>}
    >
      <div className="settings-group-label">المظهر</div>
      <div className="segmented">
        <button
          className={darkMode ? 'segmented-btn' : 'segmented-btn active'}
          onClick={() => onSetDarkMode(false)}
        >
          <Icon name="sun" size={19} />
          فاتح
        </button>
        <button
          className={darkMode ? 'segmented-btn active' : 'segmented-btn'}
          onClick={() => onSetDarkMode(true)}
        >
          <Icon name="moon" size={19} />
          داكن
        </button>
      </div>

      <div className="settings-group-label">حجم الخط</div>
      <div className="segmented">
        <button
          className={fontLarge ? 'segmented-btn' : 'segmented-btn active'}
          onClick={() => onSetFontLarge(false)}
        >
          عادي
        </button>
        <button
          className={fontLarge ? 'segmented-btn active' : 'segmented-btn'}
          onClick={() => onSetFontLarge(true)}
        >
          كبير
        </button>
      </div>

      {showPatientOptions && (
        <React.Fragment>
          <div className="settings-row">
            <div>
              <div className="settings-row-title">تكبير الخط تلقائيًا بالليل</div>
              <div className="settings-row-desc">لتحسين الرؤية لشاشة المريض بعد الساعة 7 مساءً</div>
            </div>
            <Toggle
              on={autoNightScale}
              onChange={onToggleAutoNightScale}
              label="تكبير الخط تلقائيًا بالليل"
            />
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-row-title">صوت المنبه</div>
              <div className="settings-row-desc">رنة واهتزاز لما ميعاد الدوا ييجي والتطبيق مفتوح</div>
            </div>
            <Toggle on={alarmEnabled} onChange={onToggleAlarmEnabled} label="صوت المنبه" />
          </div>
        </React.Fragment>
      )}

      {/* ---------- الحساب ----------
          تغيير كلمة المرور مكانش موجود خالص: المتابع اللي بيشك إن حد شاف
          باسورده مكانش قدامه أي حاجة يعملها. للمريض مفيش باسورد أصلاً (بيدخل
          بلينك) فالقسم ده مبيبانش عنده. */}
      {!showPatientOptions && (
        <React.Fragment>
          <div className="settings-group-label">الحساب</div>
          <div className="settings-row">
            <div>
              <div className="settings-row-title">كلمة المرور</div>
              <div className="settings-row-desc">غيّرها لو بتشك إن حد شافها</div>
            </div>
            <button className="settings-notif-btn" onClick={() => setShowPassword(true)}>
              تغيير
            </button>
          </div>
        </React.Fragment>
      )}

      {showPassword && <ChangePasswordModal onClose={() => setShowPassword(false)} />}

      {/* ---------- التنبيهات ---------- */}

      <div className="settings-group-label">التنبيهات</div>

      <Banner onClose={() => setPrefsError('')}>{prefsError}</Banner>

      <div className="settings-row settings-row-wrap">
        <div>
          <div className="settings-row-title">تنبيهات الجهاز</div>
          <div className="settings-row-desc">
            التنبيه بيوصل حتى والتطبيق مقفول - من غيرها التذكير بيشتغل بس والتطبيق مفتوح
          </div>
        </div>

        {pushStatus === 'ready' ? (
          <span className="settings-notif-ok">
            <Icon name="checkCircle" size={17} />
            مفعّل
          </span>
        ) : pushStatus === 'unsupported' ? (
          <span className="settings-notif-ok muted">مش متاح في المتصفح ده</span>
        ) : pushStatus === 'blocked' || pushStatus === 'needs-install' ? (
          <button
            className="settings-notif-btn settings-notif-btn-muted"
            onClick={() => setNotifHelpOpen((v) => !v)}
          >
            {pushStatus === 'blocked' ? 'موقوفة - إزاي أفعلها؟' : 'محتاجة تثبيت - إزاي؟'}
          </button>
        ) : (
          <button className="settings-notif-btn" onClick={handleEnablePush} disabled={busy}>
            {busy ? '...' : 'تفعيل'}
          </button>
        )}

        {notifHelpOpen && pushStatus === 'blocked' && (
          <div className="settings-notif-help">
            افتح إعدادات الموقع من المتصفح (دوس على علامة القفل جنب عنوان الموقع فوق) وفعّل
            "الإشعارات" من هناك، بعدين ارجع للتطبيق.
          </div>
        )}
        {/* آيفون: القيد ده من آبل مش مننا - Safari العادي مبيدعمش الإشعارات
            خالص، لازم التطبيق يتفتح من أيقونة على الشاشة الرئيسية. */}
        {notifHelpOpen && pushStatus === 'needs-install' && (
          <div className="settings-notif-help">
            على الآيفون، التنبيهات بتشتغل بس لو التطبيق متثبت: دوس على زرار المشاركة تحت في
            Safari، بعدين "إضافة إلى الشاشة الرئيسية"، وافتح التطبيق من الأيقونة اللي هتظهر.
          </div>
        )}

        {pushStatus === 'ready' && (
          <React.Fragment>
            <button className="settings-notif-btn settings-notif-btn-muted" onClick={handleTest} disabled={busy}>
              {busy ? '...' : 'ابعت تنبيه تجريبي'}
            </button>
            {testResult && <div className="settings-notif-help">{testResult}</div>}
          </React.Fragment>
        )}
      </div>

      {prefs && (
        <React.Fragment>
          <div className="settings-row">
            <div>
              <div className="settings-row-title">تنبيهات مواعيد الدوا</div>
              <div className="settings-row-desc">وقت الجرعة والتذكير اللي بعده</div>
            </div>
            <Toggle
              on={Boolean(prefs.pref_dose_due)}
              onChange={() => savePref({ pref_dose_due: !prefs.pref_dose_due })}
              label="تنبيهات مواعيد الدوا"
            />
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-row-title">تنبيه الجرعة الفايتة</div>
              <div className="settings-row-desc">لما جرعة تعدي من غير تسجيل</div>
            </div>
            <Toggle
              on={Boolean(prefs.pref_missed_dose)}
              onChange={() => savePref({ pref_missed_dose: !prefs.pref_missed_dose })}
              label="تنبيه الجرعة الفايتة"
            />
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-row-title">تذكير المواعيد الطبية</div>
              <div className="settings-row-desc">قبل الموعد بـ 24 ساعة</div>
            </div>
            <Toggle
              on={Boolean(prefs.pref_appointment)}
              onChange={() => savePref({ pref_appointment: !prefs.pref_appointment })}
              label="تذكير المواعيد الطبية"
            />
          </div>

          {!showPatientOptions && (
            <div className="settings-row">
              <div>
                <div className="settings-row-title">بلاغات المريض</div>
                <div className="settings-row-desc">لما المريض يدوس "حصلت مشكلة؟"</div>
              </div>
              <Toggle
                on={Boolean(prefs.pref_patient_issue)}
                onChange={() => savePref({ pref_patient_issue: !prefs.pref_patient_issue })}
                label="بلاغات المريض"
              />
            </div>
          )}

          {/* ---------- ساعات الهدوء ---------- */}

          <div className="settings-row">
            <div>
              <div className="settings-row-title">ساعات الهدوء</div>
              {/* السطر ده مش تفصيلة قانونية - ده الوعد الأساسي للتطبيق.
                  المستخدم لازم يعرف إن اللي بيقفله هنا هو الإزعاج العادي بس،
                  مش شبكة الأمان. من غير الجملة دي حد ممكن يقفل التنبيهات
                  بالليل وهو فاكر إنه قفل الضجيج، ويطلع قفل التنبيه المهم. */}
              <div className="settings-row-desc">
                التنبيهات العادية بتستنى - أما الحاجات المهمة (دوا حرج فات، بلاغ عاجل) بتعدي
                في أي وقت
              </div>
            </div>
            <Toggle
              on={quietOn}
              onChange={() =>
                savePref(
                  quietOn
                    ? { quiet_start: null, quiet_end: null }
                    : { quiet_start: '22:00', quiet_end: '07:00' }
                )
              }
              label="ساعات الهدوء"
            />
          </div>

          {quietOn && (
            <div className="settings-quiet-range">
              <label className="settings-quiet-field">
                <span>من</span>
                <input
                  type="time"
                  value={prefs.quiet_start}
                  onChange={(e) => savePref({ quiet_start: e.target.value })}
                />
              </label>
              <label className="settings-quiet-field">
                <span>لـ</span>
                <input
                  type="time"
                  value={prefs.quiet_end}
                  onChange={(e) => savePref({ quiet_end: e.target.value })}
                />
              </label>
            </div>
          )}

          {/* المفتاح الرئيسي آخر حاجة عمدًا: هو الأخطر (بيقفل **كل** حاجة، حتى
              الحرج)، فمكانه مش أول حاجة العين تقع عليها. */}
          <div className="settings-row settings-row-danger">
            <div>
              <div className="settings-row-title">إيقاف كل التنبيهات</div>
              <div className="settings-row-desc">
                هيقفل كل حاجة على كل أجهزتك، حتى التنبيهات المهمة
              </div>
            </div>
            <Toggle
              on={!prefs.push_enabled}
              onChange={() => savePref({ push_enabled: !prefs.push_enabled })}
              label="إيقاف كل التنبيهات"
            />
          </div>
        </React.Fragment>
      )}
    </Modal>
  );
}

/* نافذة تغيير كلمة المرور. منفصلة عن شيت الإعدادات عشان الإعدادات تفضل شاشة
   بتتقري بنظرة، مش فورم جوه فورم. */
function ChangePasswordModal({ onClose }) {
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [done, setDone] = React.useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    // الفحص ده هنا مش على السيرفر: السيرفر مبيشوفش غير كلمة واحدة، والتأكيد
    // غرضه يمسك غلطة كتابة قبل ما تتحفظ - وده شغل الواجهة
    if (newPassword !== confirmPassword) {
      setError('كلمتين المرور مش متطابقتين');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.changePassword(currentPassword, newPassword);
      setDone(true);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal
      icon="lock"
      tone="gray"
      title="تغيير كلمة المرور"
      subtitle={done ? '' : 'اكتب الحالية والجديدة'}
      onClose={onClose}
      onSubmit={done ? undefined : handleSubmit}
      footer={(close) =>
        done ? (
          <Button onClick={close}>تم</Button>
        ) : (
          <React.Fragment>
            <Button type="button" variant="soft" onClick={close} disabled={saving}>
              إلغاء
            </Button>
            <Button type="submit" loading={saving}>
              حفظ
            </Button>
          </React.Fragment>
        )
      }
    >
      {done ? (
        <p className="issue-subtitle">تمام، كلمة المرور اتغيّرت.</p>
      ) : (
        <React.Fragment>
          <Banner onClose={() => setError('')}>{error}</Banner>
          <Field label="كلمة المرور الحالية">
            <input
              type="password"
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </Field>
          <Field label="كلمة المرور الجديدة">
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </Field>
          <Field label="تأكيد كلمة المرور الجديدة">
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </Field>
        </React.Fragment>
      )}
    </Modal>
  );
}
