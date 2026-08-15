/* ============================================
   MA3ak (معاك) - شاشة تسجيل الدخول / حساب جديد
   المستخدم اللي بيسجل بنفسه هنا هو دايمًا "متابع" (ابن/بنت/ممرض).
   المريض متضافش هنا خالص - المتابع هو اللي بيضيفه من جوه التطبيق،
   والمريض بيدخل بلينك واحد من غير ما يعمل أي حاجة (شوف Patients.js).
   ============================================ */

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
      <div className="auth-card">
        <div className="auth-card-header">
          <div className="brand">
            <div className="brand-logo">🤝</div>
            <h1>معاك</h1>
            <p className="brand-tag">في كل خطوة، معاك</p>
          </div>
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

          {mode === 'login' ? (
            <LoginForm onSubmit={handleLogin} loading={loading} />
          ) : (
            <RegisterForm onSubmit={handleRegister} loading={loading} />
          )}

          {mode === 'register' && (
            <p className="auth-hint">
              الحساب ده لمتابعة كبير السن (ابن / بنت / ممرض). كبير السن نفسه مش محتاج يسجل —
              هتضيفه انت من جوه التطبيق وهيدخل بلينك واحد بس.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function LoginForm({ onSubmit, loading }) {
  const [identifier, setIdentifier] = React.useState('');
  const [password, setPassword] = React.useState('');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(identifier, password);
      }}
    >
      <Field label="رقم الموبايل أو الإيميل">
        <input
          required
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="01xxxxxxxxx"
        />
      </Field>
      <Field label="كلمة المرور">
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Button type="submit" disabled={loading}>
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
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name, phone, email, password });
      }}
    >
      <Field label="الاسم بالكامل">
        <input required value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="رقم الموبايل">
        <input
          type="tel"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="01xxxxxxxxx"
        />
      </Field>
      <Field label="الإيميل (اختياري)">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="كلمة المرور">
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Button type="submit" disabled={loading}>
        {loading ? 'جاري إنشاء الحساب...' : 'إنشاء الحساب'}
      </Button>
    </form>
  );
}
