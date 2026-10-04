/* ============================================
   MA3ak (معاك) - عناصر الهوية
   المكوّنات اللي بترسم الأشياء المميزة للتطبيق: علامة معاك، ختم الصيدلية،
   نتيجة اليوم، شريط الدوا، علامة فترة اليوم، وشاشة الإقلاع. الشكل كله في
   css/identity.css والمنطق (الفترات، التاريخ) في js/dayParts.js - هنا بس الحيط
   اللي بيوصّل الاتنين.

   السبب والفكرة وراء كل عنصر موثّقين في أول css/identity.css.
   ============================================ */

/* علامة معاك: "مع" + الألف + "ك"، والألف كبسولة واقفة (نص أصفر ونص أخضر).
   size بالبيكسل (حجم الخط). split بيرسم الكبسولة من نصين منفصلين عشان شاشة
   الإقلاع تقدر تحرّك كل نص لوحده - في أي مكان تاني الكبسولة قطعة واحدة.

   الحروف aria-hidden والعلامة كلها role="img" بـ aria-label: قارئ الشاشة لازم يقول
   "معاك" مش "مع... ك". */
function Wordmark({ size, tilt, split = false, className = '' }) {
  const style = {};
  if (size) style['--wm'] = `${size}px`;
  if (tilt != null) style['--wm-tilt'] = `${tilt}deg`;
  return (
    <span className={`wm ${className}`.trim()} style={style} role="img" aria-label="معاك">
      <span className="wm-l" aria-hidden="true">
        مع
      </span>
      <i className={`wm-caps${split ? ' wm-caps-split' : ''}`} aria-hidden="true">
        {split && (
          <React.Fragment>
            <b />
            <b />
          </React.Fragment>
        )}
      </i>
      <span className="wm-l" aria-hidden="true">
        ك
      </span>
    </span>
  );
}

/* ختم الصيدلية. الكلمة هي المعلومة (مش اللون) - tone بس بيدّي تأكيد.
   fresh: الختم لسه واقع دلوقتي، فبينزل بخبطة. icon اختياري. */
function Stamp({ tone = 'ink', big = false, flip = false, fresh = false, icon, className = '', children }) {
  const classes = ['stamp', `stamp-${tone}`];
  if (big) classes.push('stamp-big');
  if (flip) classes.push('stamp-flip');
  if (fresh) classes.push('stamp-fresh');
  if (className) classes.push(className);
  return (
    <span className={classes.join(' ')}>
      {icon && <Icon name={icon} size={18} strokeWidth={2.6} />}
      {children}
    </span>
  );
}

// علامة صغيرة بفترة اليوم: أيقونتها + اسمها بلونها. part هو واحد من DAY_PARTS (js/dayParts.js).
function PartTag({ part, className = '' }) {
  return (
    <span className={`part-tag part-${part.key} ${className}`.trim()}>
      <Icon name={part.icon} size={16} strokeWidth={2.2} />
      {part.label}
    </span>
  );
}

/* نتيجة الحيط: ورقة النهارده بتاريخها. date بيتبعت من الشاشة اللي بتحدّث "دلوقتي"
   كل شوية، فالورقة بتتبدّل لوحدها بعد نص الليل. size = حجم الخط بالبيكسل (الورقة
   كلها بالـ em). */
function CalendarLeaf({ date, size = 16 }) {
  const p = leafParts(date);
  return (
    <div className="leaf" style={{ fontSize: size }} role="img" aria-label={`النهارده ${p.weekday} ${p.day} ${p.month} ${p.year}`}>
      <span className="leaf-month" aria-hidden="true">
        {p.month}
      </span>
      <span className="leaf-day" aria-hidden="true">
        {p.day}
      </span>
      <span className="leaf-week" aria-hidden="true">
        {p.weekday}
      </span>
    </div>
  );
}

/* شريط الدوا: فقاعة لكل جرعة. items = [{ id, state, part, fresh, label }]
     state: locked | open | taken | missed
     part:  morning | noon | evening | night  (لون القرص جوه الفقاعة)
     label: نص لقارئ الشاشة ("٨:٠٠ ص - اتاخدت")
   الحالة مكتوبة في الشكل (علامة صح / ×) مش في اللون لوحده. */
function BlisterStrip({ items, label }) {
  return (
    <ol className="blister" aria-label={label}>
      {items.map((it) => (
        <li
          key={it.id}
          className={`bub bub-${it.state} part-${it.part}${it.fresh ? ' bub-fresh' : ''}`}
        >
          {it.state === 'taken' ? (
            <Icon name="check" size={20} strokeWidth={3} />
          ) : it.state === 'missed' ? (
            <Icon name="close" size={18} strokeWidth={3} />
          ) : (
            <i className="bub-pill" aria-hidden="true" />
          )}
          <span className="sr-only">{it.label}</span>
        </li>
      ))}
    </ol>
  );
}

/* تذكرة الجرعة: كعب ملوّن بفترة اليوم (أيقونتها + الساعة بخط ضخم) وجسم فيه اسم
   الدوا. الشاشتين (المريض والمتابع) بيرسموا نفس التذكرة، وكل واحدة بتحط جوه
   children اللي محتاجاه في الطرف: زرار "اتاخد"، ختم "فاتت"، إلخ.
     scheduledAt  الميعاد كنص "YYYY-MM-DD HH:MM:SS" (بيحدد الفترة واللون)
     meta         سطر صغير تحت الاسم (الجرعة، حالة الجرعة)
     notes        تعليمات الدكتور لو فيه (سطر مميّز)
     done         خلصت (اتاخدت/فاتت): الجسم بيبهت شوية */
function DoseTicket({ scheduledAt, name, meta, notes, done = false, className = '', children }) {
  const part = dayPartOfTime(scheduledAt);
  const time = formatClockParts(scheduledAt);
  return (
    <div className={`ticket part-${part.key}${done ? ' is-done' : ''} ${className}`.trim()}>
      <div className="ticket-stub">
        <Icon name={part.icon} size={22} strokeWidth={2.2} />
        <div className="ticket-time">
          {time.clock}
          <span className="ticket-ampm">{time.ampm}</span>
        </div>
      </div>
      <div className="ticket-main">
        <div className="ticket-name">{name}</div>
        {meta && <div className="ticket-meta">{meta}</div>}
        {notes && <div className="patient-secondary-notes">{notes}</div>}
      </div>
      <div className="ticket-end">{children}</div>
    </div>
  );
}

/* بيرجّع مجموعة ids الجرعات اللي اتاخدت **قدام عينك دلوقتي** (كانت معلّقة أو فايتة
   واتحوّلت لـ"اتاخدت" في الرندر ده)، لمدة ثانية ونص - عشان فقاعتها تتفرقع.
   أول تحميل مبيعتبرش حاجة "جديدة": الجرعات اللي اتاخدت الصبح مش المفروض تتفرقع
   كل مرة المريض يفتح التطبيق. */
function useJustTaken(doses) {
  const previous = React.useRef(null);
  const [fresh, setFresh] = React.useState(() => new Set());

  React.useEffect(() => {
    const current = new Map(doses.map((d) => [d.id, d.status]));
    let timer = null;
    if (previous.current) {
      const justTaken = doses
        .filter((d) => d.status === 'taken' && previous.current.has(d.id) && previous.current.get(d.id) !== 'taken')
        .map((d) => d.id);
      if (justTaken.length) {
        setFresh(new Set(justTaken));
        timer = setTimeout(() => setFresh(new Set()), 1500);
      }
    }
    previous.current = current;
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [doses]);

  return fresh;
}

/* شاشة الإقلاع: العلامة وهي بتتركّب. نفس الماركب بالظبط موجود في index.html
   (قبل ما React يشتغل) - لو غيّرت أي حاجة هنا غيّرها هناك كمان، وإلا هتحصل قفزة. */
function BootScreen() {
  return (
    <div className="boot-screen">
      <div className="boot-name">
        <Wordmark split />
      </div>
      <Spinner />
    </div>
  );
}
