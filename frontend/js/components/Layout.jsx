/* ============================================
   MA3ak (معاك) - الهيكل العام: هيدر + تابات سفلية
   ============================================ */

function AppLayout({
  user,
  patients,
  activePatientId,
  onSwitchPatient,
  view,
  onChangeView,
  onLogout,
  unreadCount,
  issueAlerts,
  onDismissIssue,
  onOpenSettings,
  children,
}) {
  const tabs = [
    { key: 'today', label: 'اليوم', icon: '🏠' },
    { key: 'medications', label: 'الأدوية', icon: '💊' },
    { key: 'appointments', label: 'المواعيد', icon: '📅' },
    { key: 'vitals', label: 'القياسات', icon: '🩺' },
    { key: 'notifications', label: 'الإشعارات', icon: '🔔' },
  ];

  if (user.role === 'caregiver') {
    tabs.push({ key: 'patients', label: 'المرضى', icon: '🧓' });
  }

  const hasPatientSwitcher = user.role === 'caregiver' && patients.length > 0;
  const userInitial = (user.name || '').trim()[0] || '؟';

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-inner">
          <div className="header-row">
            <div className="header-brand">
              <span className="header-brand-logo" aria-hidden="true">
                🤝
              </span>
              <span className="header-brand-name">
                <span className="header-brand-ar">معاك</span>
                <span className="header-brand-en">Ma3ak</span>
              </span>
            </div>

            {hasPatientSwitcher && (
              <div className="patient-switcher">
                <span className="patient-switcher-icon" aria-hidden="true">
                  🧓
                </span>
                <div className="patient-select-wrap">
                  <select
                    className="patient-select"
                    value={activePatientId || ''}
                    onChange={(e) => onSwitchPatient(Number(e.target.value))}
                    aria-label="بتتابع"
                  >
                    {patients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="header-actions">
              <div className="header-user-chip" title={user.name}>
                <span className="header-user-avatar" aria-hidden="true">
                  {userInitial}
                </span>
                <span className="header-user">{user.name}</span>
              </div>
              <div className="header-icon-group">
                <button
                  className="header-icon-btn"
                  onClick={onOpenSettings}
                  aria-label="الإعدادات"
                  title="الإعدادات"
                >
                  ⚙️
                </button>
                {/* أيقونة + كلمة "خروج" واضحة عمدًا - أيقونة لوحدها ممكن تتلخبط مع زرار الإعدادات جنبها */}
                <button className="header-logout" onClick={onLogout} aria-label="تسجيل الخروج" title="تسجيل الخروج">
                  <span aria-hidden="true">🚪</span>
                  <span className="header-logout-label">خروج</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="app-main">
        {issueAlerts && issueAlerts.length > 0 && (
          <IssueAlerts alerts={issueAlerts} onDismiss={onDismissIssue} />
        )}
        {children}
      </main>

      <nav className="tab-bar">
        <div className="tab-bar-inner">
          {tabs.map((t) => (
            <button
              key={t.key}
              className={view === t.key ? 'tab-bar-item active' : 'tab-bar-item'}
              onClick={() => onChangeView(t.key)}
            >
              <span className="tab-icon-wrap">
                <span className="tab-icon">{t.icon}</span>
                {t.key === 'notifications' && unreadCount > 0 && (
                  <span className="badge">{unreadCount}</span>
                )}
              </span>
              <span className="tab-label">{t.label}</span>
              <span className="tab-dot" aria-hidden="true"></span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

// بانر بارز بيظهر فوق أي تاب لما مريض يبلّغ عن مشكلة، لحد ما المتابع يقفله بنفسه
function IssueAlerts({ alerts, onDismiss }) {
  return (
    <div className="issue-alert-stack">
      {alerts.map((n) => (
        <div key={n.id} className="issue-alert">
          <span className="issue-alert-icon">❗</span>
          <div className="issue-alert-body">
            <div className="issue-alert-message">{n.message}</div>
            <div className="issue-alert-time">{formatDateTime(n.created_at)}</div>
          </div>
          <button className="issue-alert-dismiss" onClick={() => onDismiss(n.id)}>
            تمام
          </button>
        </div>
      ))}
    </div>
  );
}
