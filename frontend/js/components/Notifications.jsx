/* ============================================
   MA3ak (معاك) - الإشعارات
   ============================================ */

// أسماء أيقونات من js/icons.jsx حسب نوع الإشعار
const NOTIF_ICONS = {
  missed_dose: 'warning',
  upcoming_appointment: 'calendar',
  general: 'bell',
  patient_issue: 'alert',
};

function NotificationsView({ notifications, onRefresh }) {
  const [error, setError] = React.useState('');

  async function handleClick(n) {
    if (n.is_read) return;
    try {
      await api.markNotificationRead(n.id);
      onRefresh();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleReadAll() {
    try {
      await api.markAllNotificationsRead();
      onRefresh();
    } catch (e) {
      setError(e.message);
    }
  }

  const hasUnread = notifications.some((n) => !n.is_read);

  return (
    <div className="view">
      <div className="view-header">
        <h2 className="view-title">الإشعارات</h2>
        {hasUnread && (
          <Button variant="ghost" onClick={handleReadAll}>
            تعليم الكل كمقروء
          </Button>
        )}
      </div>

      <Banner onClose={() => setError('')}>{error}</Banner>

      {notifications.length === 0 ? (
        <EmptyState icon="bell" text="مفيش إشعارات لسه." />
      ) : (
        <Card className="notif-list stagger">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={n.is_read ? 'notif-item' : 'notif-item unread'}
              onClick={() => handleClick(n)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleClick(n);
                }
              }}
              aria-label={`${n.is_read ? '' : 'غير مقروء: '}${n.message}، ${formatDateTime(n.created_at)}`}
            >
              <span className="notif-icon" aria-hidden="true">
                <Icon name={NOTIF_ICONS[n.type] || 'bell'} size={23} />
              </span>
              <div>
                <div className="notif-message">{n.message}</div>
                <div className="notif-date">{formatDateTime(n.created_at)}</div>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
