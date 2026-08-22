/* ============================================
   MA3ak (معاك) - شاشة تسجيل الدخول / حساب جديد
   المستخدم اللي بيسجل بنفسه هنا هو دايمًا "متابع" (ابن/بنت/ممرض).
   المريض متضافش هنا خالص - المتابع هو اللي بيضيفه من جوه التطبيق،
   والمريض بيدخل بلينك واحد من غير ما يعمل أي حاجة (شوف Patients.jsx).

   الشاشة دي كمان هي واجهة التعريف بالتطبيق: أي حد بيوصله لينك المشروع أو
   بيفتحه لأول مرة بيشوفها قبل أي حاجة تانية، فنص الشاشة عرض للمميزات
   ونصها الفورم. على الموبايل الفورم بييجي الأول والمميزات تحته - محدش
   يستنى يسكرول عشان يسجّل دخول.
   ============================================ */

// مصدر واحد لقايمة المميزات - أي ميزة جديدة تتضاف هنا وبتظهر في الشاشة على طول.
// النبرة (tone) بتحدد لون دايرة الأيقونة بس، عشان الشبكة متبقاش لون واحد ممل.
const APP_FEATURES = [
  {
    icon: 'pill',
    title: 'مواعيد الدوا',
    desc: 'كل جرعة في ميعادها، والمريض بيأكد إنه خدها بضغطة واحدة.',
  },
  {
    icon: 'bell',
    title: 'تذكير بصوت وإشعار',
    desc: 'رنّة وفايبريشن وإشعار على موبايل المريض أول ما الميعاد ييجي.',
    tone: 'accent',
  },
  {
    icon: 'alert',
    title: 'زرار "حصلت مشكلة؟"',
    desc: 'الدوا خلص؟ حاسس بتعب؟ عايز حد يكلمك؟ ضغطة واحدة والخبر بيوصلك فورًا.',
    tone: 'danger',
  },
  {
    icon: 'calendar',
    title: 'المواعيد الطبية',
    desc: 'مواعيد الدكاترة والتحاليل، مع تذكير تلقائي قبل الموعد بـ 24 ساعة.',
    tone: 'info',
  },
  {
    icon: 'stethoscope',
    title: 'القياسات الصحية',
    desc: 'ضغط، سكر، وزن، نبض، وحرارة - كل قياس متسجّل بتاريخه وقدامك في أي وقت.',
  },
  {
    icon: 'link',
    title: 'المريض بيدخل بلينك واحد',
    desc: 'من غير حساب ولا باسورد يحفظه - يدوس على اللينك ويلاقي كل حاجة جاهزة.',
    tone: 'info',
  },
  {
    icon: 'users',
    title: 'أكتر من متابع',
    desc: 'الإخوات كلهم يتابعوا نفس الشخص بكود مشاركة، وكل واحد شايف نفس البيانات.',
    tone: 'accent',
  },
  {
    icon: 'install',
    title: 'يتثبّت زي أي تطبيق',
    desc: 'شغال على الموبايل والكمبيوتر، وممكن تحطه على شاشتك الرئيسية بضغطة.',
  },
];

const APP_BADGES = [
  { icon: 'textSize', label: 'خط كبير وأزرار واسعة' },
  { icon: 'moon', label: 'وضع ليلي' },
  { icon: 'speaker', label: 'نطق صوتي للجرعة' },
  { icon: 'speech', label: 'عربي بالكامل' },
];

function AuthScreen({ onAuthenticated, initialError }) {
  const [mode, setMode] = React.useState('login');
  const [error, setError] = React.useState(initialError || '');
  const [loading, setLoading] = React.useState(false);

  async function handleLogin(identifier, password) {
    setError('');
    setLoading(true);
    try {
      const data = await api.login(identifier, password);
      setToken(data.token);
      await onAuthenticated(data.user);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(payload) {
    setError('');
    setLoading(true);
    try {
      const data = await api.register(payload);
      setToken(data.token);
      await onAuthenticated(data.user);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen">
      {/* خلفية لونية متحركة + طبقة حبيبات فوقها - ديكور بحت، متخفي عن قارئ الشاشة.
          الحبيبات مش زينة: من غيرها التدرّجات الواسعة بتطلع فيها أحزمة لونية
          واضحة على الشاشات العادية (شوف .auth-grain في auth.css). */}
      <div className="auth-mesh" aria-hidden="true" />
      <div className="auth-grain" aria-hidden="true" />

      <div className="auth-layout">
        <section className="auth-panel">
          <div className="auth-card">
            <div className="auth-card-header">
              <div className="auth-card-logo" aria-hidden="true">
                <Icon name="brand" size={38} strokeWidth={1.8} />
              </div>
              <h1 className="auth-card-title">معاك</h1>
              <p className="auth-card-tag">في كل خطوة، معاك</p>
            </div>

            <div className="auth-card-body">
              <div className="tabs" role="tablist" aria-label="نوع الدخول">
                <button
                  role="tab"
                  aria-selected={mode === 'login'}
                  className={mode === 'login' ? 'tab active' : 'tab'}
                  onClick={() => setMode('login')}
                >
                  دخول
                </button>
                <button
                  role="tab"
                  aria-selected={mode === 'register'}
                  className={mode === 'register' ? 'tab active' : 'tab'}
                  onClick={() => setMode('register')}
                >
                  حساب جديد
                </button>
              </div>

              <Banner type="error" onClose={() => setError('')}>
                {error}
              </Banner>

              {/* key بيخلي React يعيد تركيب الفورم مع كل تبديل، فحركة الدخول
                  بتشتغل من أول وجديد بدل ما تحصل مرة واحدة بس */}
              {mode === 'login' ? (
                <LoginForm key="login" onSubmit={handleLogin} loading={loading} />
              ) : (
                <RegisterForm key="register" onSubmit={handleRegister} loading={loading} />
              )}

              {mode === 'register' && (
                <p className="auth-hint">
                  الحساب ده لمتابعة كبير السن (ابن / بنت / ممرض). كبير السن نفسه مش محتاج يسجل —
                  هتضيفه انت من جوه التطبيق وهيدخل بلينك واحد بس.
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="auth-showcase">
          <div className="auth-brand">
            <div className="auth-logo" aria-hidden="true">
              <Icon name="brand" size={44} strokeWidth={1.7} />
            </div>
            <div>
              <h2 className="auth-title text-gradient">معاك</h2>
              <p className="auth-tagline">في كل خطوة، معاك</p>
            </div>
          </div>

          <p className="auth-pitch">
            تطبيق واحد بيخلي متابعة كبير السن أسهل: <strong>إنت</strong> بتجهّز الأدوية والمواعيد
            من موبايلك، و<strong>هو</strong> بيفتح شاشة واحدة بسيطة فيها جرعة واحدة بس كل مرة.
          </p>

          <ul className="auth-features stagger">
            {APP_FEATURES.map((f) => (
              <li key={f.title} className="auth-feature">
                <span className={`auth-feature-icon${f.tone ? ` tone-${f.tone}` : ''}`} aria-hidden="true">
                  <Icon name={f.icon} size={24} />
                </span>
                <div>
                  <div className="auth-feature-title">{f.title}</div>
                  <div className="auth-feature-desc">{f.desc}</div>
                </div>
              </li>
            ))}
          </ul>

          <div className="auth-badges">
            {APP_BADGES.map((b) => (
              <span key={b.label} className="auth-badge">
                <Icon name={b.icon} size={16} />
                {b.label}
              </span>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function LoginForm({ onSubmit, loading }) {
  const [identifier, setIdentifier] = React.useState('');
  const [password, setPassword] = React.useState('');

  return (
    <form
      className="auth-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(identifier, password);
      }}
    >
      <Field label="رقم الموبايل أو الإيميل">
        {/* autoComplete بيخلي المتصفح ومدير كلمات المرور على الموبايل يقترحوا
            البيانات المحفوظة بدل ما المستخدم يكتبها كل مرة */}
        <input
          required
          autoComplete="username"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="01xxxxxxxxx"
        />
      </Field>
      <Field label="كلمة المرور">
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Button type="submit" loading={loading}>
        {loading ? 'جاري الدخول...' : 'دخول'}
      </Button>
    </form>
  );
}

function RegisterForm({ onSubmit, loading }) {
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');

  return (
    <form
      className="auth-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name, phone, email, password });
      }}
    >
      <Field label="الاسم بالكامل">
        <input required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="رقم الموبايل">
        <input
          type="tel"
          required
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="01xxxxxxxxx"
        />
      </Field>
      <Field label="الإيميل (اختياري)">
        <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="كلمة المرور">
        <input
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Button type="submit" loading={loading}>
        {loading ? 'جاري إنشاء الحساب...' : 'إنشاء الحساب'}
      </Button>
    </form>
  );
}
