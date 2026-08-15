/* ============================================
   MA3ak (معاك) - شاشة الإعدادات
   مشتركة بين المتابع والمريض: المظهر (فاتح/داكن) وحجم الخط تفضيل عام للجهاز.
   تكبير الخط التلقائي بالليل وصوت التذكير بالجرعات خاصين بتجربة المريض بس،
   فبيظهروا في شاشة الإعدادات بتاعة المريض فقط (showPatientOptions).
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
  notifPermission,
  onRequestNotifPermission,
  showPatientOptions,
  onClose,
}) {
  const [notifHelpOpen, setNotifHelpOpen] = React.useState(false);

  return (
    <Modal title="الإعدادات" onClose={onClose}>
      <div className="settings-group-label">المظهر</div>
      <div className="segmented">
        <button
          className={darkMode ? 'segmented-btn' : 'segmented-btn active'}
          onClick={() => onSetDarkMode(false)}
        >
          ☀️ فاتح
        </button>
        <button
          className={darkMode ? 'segmented-btn active' : 'segmented-btn'}
          onClick={() => onSetDarkMode(true)}
        >
          🌙 داكن
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
            <button
              className={autoNightScale ? 'toggle-switch on' : 'toggle-switch'}
              onClick={onToggleAutoNightScale}
              role="switch"
              aria-checked={autoNightScale}
              aria-label="تكبير الخط تلقائيًا بالليل"
            >
              <span className="toggle-thumb"></span>
            </button>
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-row-title">صوت التذكير بالجرعات</div>
              <div className="settings-row-desc">رنة وفايبريشن لما ميعاد الدوا ييجي</div>
            </div>
            <button
              className={alarmEnabled ? 'toggle-switch on' : 'toggle-switch'}
              onClick={onToggleAlarmEnabled}
              role="switch"
              aria-checked={alarmEnabled}
              aria-label="صوت التذكير بالجرعات"
            >
              <span className="toggle-thumb"></span>
            </button>
          </div>

          <div className="settings-row settings-row-wrap">
            <div>
              <div className="settings-row-title">إشعارات المتصفح</div>
              <div className="settings-row-desc">تنبيه فوري بمواعيد الدوا</div>
            </div>
            {notifPermission === 'granted' ? (
              <span className="settings-notif-ok">✅ مفعّل</span>
            ) : notifPermission === 'unsupported' ? (
              <span className="settings-notif-ok muted">مش متاح</span>
            ) : notifPermission === 'denied' ? (
              <button
                className="settings-notif-btn settings-notif-btn-muted"
                onClick={() => setNotifHelpOpen((v) => !v)}
              >
                موقوفة - إزاي أفعلها؟
              </button>
            ) : (
              <button className="settings-notif-btn" onClick={onRequestNotifPermission}>
                تفعيل
              </button>
            )}
            {notifPermission === 'denied' && notifHelpOpen && (
              <div className="settings-notif-help">
                افتح إعدادات الموقع من المتصفح (دوس على 🔒 جنب عنوان الموقع فوق) وفعّل "الإشعارات"
                من هناك، بعدين ارجع للتطبيق.
              </div>
            )}
          </div>
        </React.Fragment>
      )}

      <Button onClick={onClose} style={{ marginTop: 16 }}>
        تم
      </Button>
    </Modal>
  );
}
