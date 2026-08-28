/* ============================================
   MA3ak (معاك) - الإشعارات

   الشاشة دي بقت مبنية على تفرقتين، الاتنين مقصودين:

   1. **الأولوية**: مش كل إشعار بنفس الوزن. "موعد بكرة" معلومة، و"دوا حرج
      فات" حاجة محتاجة تصرّف دلوقتي. لما الاتنين شكلهم واحد، المتابع بيتعوّد
      يعدّي على القايمة بسرعة - وساعتها المهم بيضيع وسط العادي.

   2. **"اتقرا" غير "اتعامل معاه"**: المتابع لما يشوف بلاغ "الدوا خلص" ده مش
      معناه إنه جاب الدوا. الزرار الأخضر بيقول "خلصت الموضوع ده" - وده اللي
      بيخلي القايمة تفضل تعني حاجة بدل ما تبقى سجل قديم كله مقروء.

   والتجميع: 3 جرعات فايتة في يوم واحد بيبقوا صف واحد "فوّت 3 جرعات"، مش
   3 صفوف. متابع بيتابع أكتر من مريض بيتغرق بسرعة، والإغراق بيخلي الشاشة كلها
   تتجاهل.
   ============================================ */

// أسماء أيقونات من js/icons.jsx حسب نوع الإشعار
const NOTIF_ICONS = {
  missed_dose: 'warning',
  dose_escalation: 'alert',
  dose_due: 'pill',
  dose_reminder: 'clock',
  upcoming_appointment: 'calendar',
  general: 'bell',
  patient_issue: 'alert',
};

// الأنواع اللي فيها فعل مطلوب من المتابع - دي بس اللي بتاخد زرار "خلصته".
// موعد قريب أو تذكير جرعة مش محتاجين "تصرّف"، فزرار عليهم بيبقى ضوضاء.
const ACTIONABLE_TYPES = new Set(['patient_issue', 'missed_dose', 'dose_escalation']);

// عنوان مختصر لكل نوع، بيستخدم في راس المجموعة المدموجة
const GROUP_TITLES = {
  missed_dose: 'جرعات فايتة',
  dose_due: 'تنبيهات دوا',
  dose_reminder: 'تذكيرات دوا',
  upcoming_appointment: 'مواعيد قريبة',
  patient_issue: 'بلاغات',
  dose_escalation: 'تنبيهات مهمة',
  general: 'إشعارات',
};

// أقل عدد إشعارات متشابهة عشان يتجمّعوا في صف واحد. اتنين مش بيغرقوا حد،
// وتلاتة هي أول نقطة القايمة بتبدأ تبان فيها متكررة.
const GROUP_MIN = 3;

/* بيجمّع الإشعارات المتشابهة (نفس النوع + نفس المريض + نفس اليوم).
   الإشعار الحرج عمره ما بيتجمّع: هو الحاجة الوحيدة اللي المفروض تاخد مساحتها
   كاملة على الشاشة، ودمجه في صف مع غيره بيلغي الغرض منه أصلاً. */
function groupNotifications(notifications) {
  const groups = new Map();
  const output = [];

  for (const n of notifications) {
    if (n.priority === 'critical') {
      output.push({ kind: 'single', notification: n, key: `n-${n.id}` });
      continue;
    }
    const day = String(n.created_at).slice(0, 10);
    const key = `${n.type}|${n.patient_id}|${day}`;
    if (!groups.has(key)) {
      const bucket = { kind: 'group', key: `g-${key}`, type: n.type, items: [] };
      groups.set(key, bucket);
      output.push(bucket);
    }
    groups.get(key).items.push(n);
  }

  /* مجموعة صغيرة أوي مالهاش لازمة تتعرض كمجموعة - بتترسم كصفوف عادية.
     حلقة عادية مش flatMap: هدف البناء es2017 (كروم 55+) عشان أجهزة أندرويد
     قديمة، وflatMap دخلت في ES2019 - esbuild بيترجم الصياغة مش الدوال المدمجة،
     فكانت هترمي خطأ على الأجهزة دي بالظبط. */
  const flattened = [];
  for (const entry of output) {
    if (entry.kind === 'single' || entry.items.length >= GROUP_MIN) {
      flattened.push(entry);
      continue;
    }
    for (const n of entry.items) {
      flattened.push({ kind: 'single', notification: n, key: `n-${n.id}` });
    }
  }
  return flattened;
}

function NotificationsView({ notifications, onRefresh }) {
  const [error, setError] = React.useState('');
  const [filter, setFilter] = React.useState('all'); // all | unread
  const [expanded, setExpanded] = React.useState(() => new Set());

  async function run(fn) {
    try {
      await fn();
      onRefresh();
    } catch (e) {
      setError(e.message);
    }
  }

  function handleOpen(n) {
    if (n.is_read) return;
    run(() => api.markNotificationRead(n.id));
  }

  function handleHandled(e, n) {
    e.stopPropagation(); // مش عايزين الدوسة تتحسب "فتح" كمان
    run(() => api.markNotificationHandled(n.id));
  }

  function toggleGroup(key) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const visible = filter === 'unread' ? notifications.filter((n) => !n.is_read) : notifications;
  const entries = groupNotifications(visible);
  const hasUnread = notifications.some((n) => !n.is_read);
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  function renderRow(n, inGroup) {
    const actionable = ACTIONABLE_TYPES.has(n.type) && !n.handled_at;
    return (
      <div
        key={n.id}
        className={
          `notif-item notif-${n.priority}` +
          (n.is_read ? '' : ' unread') +
          (n.handled_at ? ' notif-handled' : '') +
          (inGroup ? ' notif-item-nested' : '')
        }
        onClick={() => handleOpen(n)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleOpen(n);
          }
        }}
        aria-label={`${n.is_read ? '' : 'غير مقروء: '}${
          n.priority === 'critical' ? 'مهم: ' : ''
        }${n.message}، ${formatDateTime(n.created_at)}`}
      >
        <span className="notif-icon" aria-hidden="true">
          <Icon name={NOTIF_ICONS[n.type] || 'bell'} size={23} />
        </span>
        <div className="notif-body">
          <div className="notif-message">{n.message}</div>
          <div className="notif-date">
            {formatDateTime(n.created_at)}
            {n.handled_at && <span className="notif-handled-tag"> · اتعامل معاه</span>}
          </div>
        </div>
        {actionable && (
          <button
            className="notif-handle-btn"
            onClick={(e) => handleHandled(e, n)}
            aria-label="علّم إن الموضوع خلص"
          >
            <Icon name="check" size={15} strokeWidth={2.6} />
            خلصته
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="view">
      <div className="view-header">
        <h2 className="view-title">الإشعارات</h2>
        {hasUnread && (
          <Button variant="ghost" onClick={() => run(() => api.markAllNotificationsRead())}>
            تعليم الكل كمقروء
          </Button>
        )}
      </div>

      <Banner onClose={() => setError('')}>{error}</Banner>

      {notifications.length > 0 && (
        <div className="segmented notif-filter">
          <button
            className={filter === 'all' ? 'segmented-btn active' : 'segmented-btn'}
            onClick={() => setFilter('all')}
          >
            الكل
          </button>
          <button
            className={filter === 'unread' ? 'segmented-btn active' : 'segmented-btn'}
            onClick={() => setFilter('unread')}
          >
            غير مقروء{unreadCount > 0 && ` (${unreadCount})`}
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon="bell"
          text={filter === 'unread' ? 'مفيش إشعارات غير مقروءة.' : 'مفيش إشعارات لسه.'}
        />
      ) : (
        <Card className="notif-list stagger">
          {entries.map((entry) => {
            if (entry.kind === 'single') return renderRow(entry.notification, false);

            const isOpen = expanded.has(entry.key);
            const groupUnread = entry.items.filter((n) => !n.is_read).length;
            return (
              <div key={entry.key} className="notif-group">
                <button
                  className={`notif-group-head${groupUnread ? ' unread' : ''}`}
                  onClick={() => toggleGroup(entry.key)}
                  aria-expanded={isOpen}
                >
                  <span className="notif-icon" aria-hidden="true">
                    <Icon name={NOTIF_ICONS[entry.type] || 'bell'} size={23} />
                  </span>
                  <div className="notif-body">
                    <div className="notif-message">
                      {entry.items.length} {GROUP_TITLES[entry.type] || 'إشعارات'}
                    </div>
                    <div className="notif-date">
                      {formatDateTime(entry.items[0].created_at)}
                      {groupUnread > 0 && <span className="notif-handled-tag"> · {groupUnread} جديد</span>}
                    </div>
                  </div>
                  <span className={`notif-group-chevron${isOpen ? ' open' : ''}`} aria-hidden="true">
                    <Icon name="chevron" size={17} strokeWidth={2.2} />
                  </span>
                </button>
                {isOpen && (
                  <div className="notif-group-items">{entry.items.map((n) => renderRow(n, true))}</div>
                )}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
