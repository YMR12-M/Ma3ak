/* ============================================
   MA3ak (معاك) - الرسومات
   رسومات مسطّحة مرسومة بالكود (SVG)، بنفس لغة التطبيق: حافة حبر 2.5-3.5px،
   ألوان مصمتة، وظل صلب مزاح (blur = 0) زي نسخة مطبوعة بتتحرّك شوية عن حدودها.

   مكان كل رسمة: الحالات الفاضية ("مفيش أدوية"، "مفيش مواعيد")، لحظة "خلصت
   النهارده"، وشاشة الدخول. الغرض إن الحالة الفاضية متبقاش دايرة فيها أيقونة -
   تبقى حاجة من البيت: علبة الأقراص، كوباية الشاي، النتيجة.

   كل لون هنا متغيّر CSS (var(--ink) وغيره) مش قيمة مكتوبة، فالرسمة بتتحوّل
   للوضع الليلي لوحدها من غير أي كود. وكلها aria-hidden: الرسمة مش معلومة، والمعنى
   دايمًا في النص اللي جنبها.
   ============================================ */

// نص كبسولة (أقصر نص = نصف الكبسولة بلون الدوا) بحرف حبر وظل صلب. مركزها (cx, cy).
function ArtPill({ cx, cy, len, deg = 0, color }) {
  const w = len * 0.42;
  const r = w / 2;
  return (
    <g transform={`translate(${cx} ${cy}) rotate(${deg})`}>
      <rect x={-len / 2 + 3} y={-r + 3} width={len} height={w} rx={r} fill="var(--ink)" opacity="0.16" />
      <rect x={-len / 2} y={-r} width={len} height={w} rx={r} fill="var(--paper-2)" stroke="var(--ink)" strokeWidth="2.4" />
      <path
        d={`M${-len / 2 + r} ${-r} H0 V${r} H${-len / 2 + r} A${r} ${r} 0 0 1 ${-len / 2 + r} ${-r}Z`}
        fill={color}
        stroke="var(--ink)"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
    </g>
  );
}

// قرص دايري بخط في نصه
function ArtTablet({ cx, cy, r }) {
  return (
    <g>
      <circle cx={cx + 3} cy={cy + 3} r={r} fill="var(--ink)" opacity="0.16" />
      <circle cx={cx} cy={cy} r={r} fill="var(--paper-2)" stroke="var(--ink)" strokeWidth="2.4" />
      <path d={`M${cx - r + 3} ${cy} H${cx + r - 3}`} stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" />
    </g>
  );
}

// ألوان غطا كل خانة بالترتيب: صبح، ضهر، مسا، ليل، وبعدين من الأول (زي علبة حقيقية)
const PILLBOX_PARTS = ['sun', 'sky', 'dusk', 'indigo'];
// أيام الأسبوع بالترتيب المصري: السبت أول يوم. الحروف: س ح ن ث ر خ ج
const PILLBOX_DAYS = ['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج'];

/* علبة الأقراص الأسبوعية.
     open      أرقام الخانات المفتوحة (0 = السبت) - بتبان من جوّاها الأقراص
     highlight رقم الخانة المعلّم عليها بخط متقطع (النهارده)
     loose     أقراص سايبة قدام العلبة
   السبت على اليمين: الأسبوع المصري بيتقرا من اليمين لليسار. */
function PillBoxArt({ open = [], highlight = -1, loose = true, className = '' }) {
  const X1 = 398;
  const SW = (X1 - 42) / 7;
  const top = 116;
  const bot = 208;
  const slotX = (i) => X1 - (i + 1) * SW;

  return (
    <svg className={`illo ${className}`.trim()} viewBox="0 0 440 250" aria-hidden="true" focusable="false">
      {/* ظل صلب مزاح + جسم العلبة */}
      <rect x="40" y="102" width="380" height="126" rx="22" fill="var(--ink)" opacity="0.16" />
      <rect x="30" y="92" width="380" height="126" rx="22" fill="var(--paper-2)" stroke="var(--ink)" strokeWidth="3.5" />
      <path d="M31.8 114a20 20 0 0 1 20-20H388a20 20 0 0 1 20 20v4H31.8Z" fill="var(--paper-3)" />
      <path d="M31.8 116.5H408.2" stroke="var(--ink)" strokeWidth="2.5" />

      {PILLBOX_DAYS.map((letter, i) => {
        const x = slotX(i);
        const part = PILLBOX_PARTS[i % 4];
        const color = `var(--${part})`;
        const isOpen = open.indexOf(i) !== -1;
        return (
          <g key={letter}>
            {isOpen ? (
              <g>
                <rect x={x + 3} y={top + 2} width={SW - 6} height={bot - top - 3} rx="8" fill="var(--paper-3)" />
                <rect x={x + 3} y={top + 2} width={SW - 6} height="14" rx="6" fill="var(--ink)" opacity="0.14" />
                <ArtPill cx={x + SW / 2 - 6} cy={top + 54} len={28} deg={-30} color={color} />
                <ArtTablet cx={x + SW / 2 + 8} cy={top + 78} r={9} />
                {/* الغطا مرفوع لفوق */}
                <path
                  d={`M${x + 5} ${top + 1}L${x + SW - 5} ${top + 1}L${x + SW - 9} ${top - 52}L${x + 9} ${top - 52}Z`}
                  fill={color}
                  stroke="var(--ink)"
                  strokeWidth="2.8"
                  strokeLinejoin="round"
                />
                <path d={`M${x + 13} ${top - 44}H${x + SW - 13}`} stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.55" />
              </g>
            ) : (
              <g>
                <rect x={x + 4} y={top + 4} width={SW - 8} height={bot - top - 6} rx="9" fill={color} stroke="var(--ink)" strokeWidth="2.8" />
                <path d={`M${x + 11} ${top + 13}H${x + SW - 11}`} stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.5" />
                <text
                  x={x + SW / 2}
                  y={top + 52}
                  textAnchor="middle"
                  fontFamily="Kufam, Cairo, sans-serif"
                  fontWeight="900"
                  fontSize="22"
                  fill="var(--ink)"
                >
                  {letter}
                </text>
                {/* حفرة الصباع في آخر الغطا */}
                <path
                  d={`M${x + SW / 2 - 8} ${bot - 4}a8 8 0 0 1 16 0`}
                  fill="var(--paper-2)"
                  stroke="var(--ink)"
                  strokeWidth="2.4"
                />
              </g>
            )}
            {i < 6 && <path d={`M${x} ${top}V${bot}`} stroke="var(--ink)" strokeWidth="2.4" />}
          </g>
        );
      })}

      {highlight >= 0 && (
        <rect
          x={slotX(highlight) + 1}
          y={top + 1}
          width={SW - 2}
          height={bot - top}
          rx="10"
          fill="none"
          stroke="var(--ink)"
          strokeWidth="3"
          strokeDasharray="6 5"
        />
      )}

      {loose && (
        <g>
          <g transform="translate(402 232) rotate(18)">
            <ArtPill cx={0} cy={0} len={46} color="var(--green)" />
          </g>
          <ArtTablet cx={318} cy={238} r={13} />
          <g transform="translate(60 232) rotate(-14)">
            <ArtPill cx={0} cy={0} len={38} color="var(--sun)" />
          </g>
        </g>
      )}
    </svg>
  );
}

/* كوباية شاي مصرية بالنعناع: كوباية صغيرة على طبق، معلقة وبخار. تعبير الراحة
   اللي بتحس بيها لما تخلّص حاجة مهمة. tea = لون الشاي (متغيّر CSS). */
function TeaGlass({ x = 0, y = 0, scale = 1, tea = 'var(--tea)', steam = true }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {steam && (
        <g fill="none" stroke="var(--ink-2)" strokeWidth="3.2" strokeLinecap="round" opacity="0.7">
          <path d="M62 44q-9-10 0-20t0-20" />
          <path d="M86 40q-9-10 0-20t0-20" opacity="0.8" />
          <path d="M110 44q-9-10 0-20t0-20" />
        </g>
      )}
      <ellipse cx="92" cy="192" rx="62" ry="12" fill="var(--ink)" opacity="0.16" />
      <ellipse cx="85" cy="186" rx="62" ry="12" fill="var(--paper-2)" stroke="var(--ink)" strokeWidth="3.5" />
      <ellipse cx="85" cy="184" rx="36" ry="6" fill="var(--paper-3)" stroke="var(--ink)" strokeWidth="2.2" />
      <path d="M38 66C42 108 44 150 50 180H120C126 150 128 108 132 66Z" fill="var(--paper-2)" stroke="var(--ink)" strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M42.2 82C45 112 47 150 52 178H118C123 150 125 112 127.8 82Z" fill={tea} />
      <ellipse cx="85" cy="82" rx="42.8" ry="7" fill="var(--sun)" opacity="0.9" />
      <path d="M52 96C55 124 56 150 59 170" stroke="#fff" strokeWidth="4" strokeLinecap="round" fill="none" opacity="0.35" />
      <g stroke="var(--ink)" strokeWidth="2.6" strokeLinejoin="round">
        <path d="M92 78C88 56 104 46 118 50C120 66 108 80 92 78Z" fill="var(--green)" />
        <path d="M86 78C70 72 66 54 74 44C90 46 96 62 86 78Z" fill="var(--green)" />
      </g>
      <path d="M94 76C100 66 106 60 112 54" stroke="var(--ink)" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M106 112L140 40" stroke="var(--ink)" strokeWidth="3.5" strokeLinecap="round" />
      <ellipse cx="143" cy="33" rx="7" ry="10" transform="rotate(25 143 33)" fill="var(--paper-2)" stroke="var(--ink)" strokeWidth="3" />
      <ellipse cx="85" cy="66" rx="47" ry="8" fill="none" stroke="var(--ink)" strokeWidth="3.5" />
    </g>
  );
}

function TeaGlassArt({ className = '' }) {
  return (
    <svg className={`illo ${className}`.trim()} viewBox="0 0 170 210" aria-hidden="true" focusable="false">
      <TeaGlass />
    </svg>
  );
}

// كوبايتين جنب بعض: المريض ومتابعه. "معاك" بالمعنى الحرفي.
function TeaPairArt({ className = '' }) {
  return (
    <svg className={`illo ${className}`.trim()} viewBox="0 0 330 215" aria-hidden="true" focusable="false">
      <TeaGlass x={0} y={4} />
      <TeaGlass x={150} y={10} scale={0.94} tea="var(--dusk-deep)" />
    </svg>
  );
}

// نتيجة (ورق تقويم) فاضية بقلم رصاص جنبها: "مفيش مواعيد لسه"
function CalendarArt({ className = '' }) {
  const cells = [];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 7; col += 1) {
      cells.push({ x: 196 - col * 24, y: 94 + row * 24, key: `${row}-${col}` });
    }
  }
  return (
    <svg className={`illo ${className}`.trim()} viewBox="0 0 260 210" aria-hidden="true" focusable="false">
      <rect x="40" y="46" width="200" height="140" rx="16" fill="var(--ink)" opacity="0.16" />
      <rect x="30" y="36" width="200" height="140" rx="16" fill="var(--paper-2)" stroke="var(--ink)" strokeWidth="3.5" />
      <path d="M31.75 70V52a16 16 0 0 1 16-16h164.5a16 16 0 0 1 16 16v18Z" fill="var(--coral)" />
      <path d="M31.75 70H228.25" stroke="var(--ink)" strokeWidth="3" />
      <rect x="66" y="22" width="12" height="28" rx="6" fill="var(--paper-3)" stroke="var(--ink)" strokeWidth="3" />
      <rect x="182" y="22" width="12" height="28" rx="6" fill="var(--paper-3)" stroke="var(--ink)" strokeWidth="3" />
      {cells.map((c) => (
        <rect key={c.key} x={c.x} y={c.y} width="18" height="16" rx="4" fill="var(--paper-3)" stroke="var(--rule-strong)" strokeWidth="1.5" />
      ))}
      <rect x="148" y="94" width="18" height="16" rx="4" fill="var(--sun)" stroke="var(--ink)" strokeWidth="2.4" />
      <rect x="143" y="89" width="28" height="26" rx="8" fill="none" stroke="var(--ink)" strokeWidth="2.6" strokeDasharray="5 4" />
      {/* قلم رصاص */}
      <g transform="translate(222 158) rotate(38)">
        <rect x="-4" y="-3" width="76" height="16" rx="3" fill="var(--ink)" opacity="0.16" />
        <rect x="-8" y="-8" width="62" height="16" rx="2" fill="var(--sun)" stroke="var(--ink)" strokeWidth="2.6" />
        <path d="M54 -8L74 0L54 8Z" fill="var(--paper-3)" stroke="var(--ink)" strokeWidth="2.6" strokeLinejoin="round" />
        <path d="M68 -2.6L74 0L68 2.6Z" fill="var(--ink)" />
        <rect x="-20" y="-8" width="12" height="16" rx="3" fill="var(--coral)" stroke="var(--ink)" strokeWidth="2.6" />
      </g>
    </svg>
  );
}

// ورقة قياسات بخط قلب: "مفيش قياسات لسه"
function ChartArt({ className = '' }) {
  return (
    <svg className={`illo ${className}`.trim()} viewBox="0 0 260 210" aria-hidden="true" focusable="false">
      <rect x="70" y="30" width="160" height="164" rx="14" fill="var(--ink)" opacity="0.16" />
      <rect x="60" y="22" width="160" height="164" rx="14" fill="var(--paper-2)" stroke="var(--ink)" strokeWidth="3.5" />
      <rect x="104" y="10" width="72" height="28" rx="9" fill="var(--sun)" stroke="var(--ink)" strokeWidth="3" />
      <rect x="126" y="16" width="28" height="9" rx="4.5" fill="var(--paper-2)" stroke="var(--ink)" strokeWidth="2.4" />
      {[70, 94, 118, 142, 166].map((y) => (
        <path key={y} d={`M76 ${y}H204`} stroke="var(--rule-strong)" strokeWidth="2" strokeLinecap="round" />
      ))}
      <path
        d="M72 120H104L112 92L126 148L138 104L146 118H208"
        fill="none"
        stroke="var(--coral)"
        strokeWidth="4.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M72 120H104L112 92L126 148L138 104L146 118H208"
        fill="none"
        stroke="var(--ink)"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.5"
      />
    </svg>
  );
}

// جرس نايم بجنبه هلال: "مفيش إشعارات - الدنيا هادية"
function BellArt({ className = '' }) {
  return (
    <svg className={`illo ${className}`.trim()} viewBox="0 0 220 200" aria-hidden="true" focusable="false">
      <ellipse cx="116" cy="178" rx="62" ry="9" fill="var(--ink)" opacity="0.16" />
      <path
        d="M118 44C84 44 68 70 68 104V130L52 150H156L140 130V104C140 70 124 44 118 44Z"
        transform="translate(-6 0)"
        fill="var(--ink)"
        opacity="0.16"
      />
      <path
        d="M104 38C70 38 54 64 54 98V124L38 144H170L154 124V98C154 64 138 38 104 38Z"
        fill="var(--sun)"
        stroke="var(--ink)"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <path d="M70 92C70 74 80 60 94 54" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity="0.55" />
      <circle cx="104" cy="30" r="8" fill="var(--paper-2)" stroke="var(--ink)" strokeWidth="3" />
      <path d="M88 150a16 14 0 0 0 32 0Z" fill="var(--dusk)" stroke="var(--ink)" strokeWidth="3" strokeLinejoin="round" />
      {/* هلال ونجمتين */}
      <path
        d="M176 34a22 22 0 1 0 14 38a17 17 0 0 1-14-38Z"
        fill="var(--indigo)"
        stroke="var(--ink)"
        strokeWidth="3"
        strokeLinejoin="round"
        transform="translate(-8 0)"
      />
      <path d="M150 26l3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill="var(--sun)" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M196 92l2 4.5 4.5 2-4.5 2-2 4.5-2-4.5-4.5-2 4.5-2Z" fill="var(--sun)" stroke="var(--ink)" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

/* اختيار الرسمة المناسبة لحالة فاضية. EmptyState بيبعت اسم أيقونة (زي ما كان)،
   وهنا بنقرر أنهي رسمة تقابلها - فمفيش نداء قديم محتاج يتغيّر. */
function EmptyArt({ icon }) {
  switch (icon) {
    case 'calendar':
      return <CalendarArt className="empty-art" />;
    case 'stethoscope':
    case 'pulse':
      return <ChartArt className="empty-art" />;
    case 'bell':
    case 'bellOff':
      return <BellArt className="empty-art" />;
    case 'user':
    case 'users':
      return <TeaPairArt className="empty-art" />;
    default:
      return <PillBoxArt className="empty-art" open={[1, 4]} loose={false} />;
  }
}
