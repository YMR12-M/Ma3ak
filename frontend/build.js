#!/usr/bin/env node
/* ============================================
   MA3ak (معاك) - بناء الواجهة (Build)

   ليه الملف ده موجود أصلًا؟
   التطبيق كان بيشتغل بـ Babel Standalone جوه المتصفح: المتصفح كان بينزّل ~3 ميجا
   من مترجم JSX، بعدين يستنى لحد ما ينزّل الـ 15 ملف بتوع التطبيق واحد ورا التاني،
   بعدين يترجمهم كلهم على الخيط الرئيسي قبل ما يرسم أول بكسل. النتيجة كانت أول رسم
   للصفحة بعد 6 ثواني على اتصال متوسط (Lighthouse: FCP 6.1s / LCP 6.7s).

   الملف ده بينقل الترجمة دي لوقت البناء بدل وقت التشغيل:
     dist/vendor.js  = React + ReactDOM (مستضافين عندنا مش من CDN خارجي)
     dist/app.js     = كل ملفات js/ متُرجمة ومدموجة ومصغّرة في ملف واحد
     dist/app.css    = كل ملفات css/ مدموجة ومصغّرة في ملف واحد

   يعني المتصفح بينزّل 3 ملفات من نفس السيرفر بدل 26 ملف + مترجم، وبيرسم على طول.

   التشغيل:  npm run build          (من مجلد backend)
             npm run build:watch    (بيعيد البناء مع كل تعديل)

   مهم: مخرجات المجلد dist/ متسجّلة في git عمدًا، عشان `npm start` يشتغل على أي
   نسخة جديدة من الريبو من غير أي خطوة بناء. لو عدّلت أي حاجة في js/ أو css/
   لازم تشغّل npm run build وتسجّل الناتج معاها - وفيه فحص في CI بيتأكد من ده.
   ============================================ */

const fs = require('fs');
const path = require('path');

const FRONTEND = __dirname;
const BACKEND = path.join(FRONTEND, '..', 'backend');
const DIST = path.join(FRONTEND, 'dist');

/* أدوات البناء متسطّبة في backend/node_modules (الريبو فيه package.json واحد بس)،
   والملف ده قاعد في frontend/ - فلازم نقوله يدوّر على esbuild هناك بالظبط، مش في
   المسار الافتراضي اللي بيبدأ من مكان الملف نفسه. */
const esbuild = require(require.resolve('esbuild', { paths: [BACKEND] }));

/* ---------- الترتيب هنا هو مصدر الحقيقة الوحيد لترتيب تحميل الواجهة ---------- */

// طبقات الـ CSS: كل طبقة بتبني على اللي قبلها (التفاصيل في docs/DESIGN.md)
const CSS_FILES = [
  'css/fonts.css',
  'css/tokens.css',
  'css/base.css',
  'css/animations.css',
  'css/materials.css',
  'css/components.css',
  'css/modal.css',
  'css/layout.css',
  'css/auth.css',
  'css/screens.css',
  'css/patient.css',
];

// ملفات التطبيق: الأدوات الأول، بعدين الأيقونات (كل المكوّنات بتستخدمها)،
// بعدين المكوّنات، وapp.jsx آخر حاجة لأنه بيستدعي ReactDOM.createRoot
const JS_FILES = [
  'js/api.js',
  'js/doseLogic.js',
  'js/icons.jsx',
  'js/components/Common.jsx',
  'js/components/Settings.jsx',
  'js/components/Auth.jsx',
  'js/components/Layout.jsx',
  'js/components/Dashboard.jsx',
  'js/components/Medications.jsx',
  'js/components/Appointments.jsx',
  'js/components/Vitals.jsx',
  'js/components/Notifications.jsx',
  'js/components/Patients.jsx',
  'js/components/PatientHome.jsx',
  'js/app.jsx',
];

/* React بنستضيفه بنفسنا بدل unpkg: بيوفّر على المتصفح فتح اتصال لدومين تاني
   (DNS + TLS + latency) قبل ما يقدر يبدأ أصلًا، وبيخلي الملف ياخد الضغط
   والكاش بتوعنا، وبيخلي التطبيق يفتح أوفلاين من الـ Service Worker.
   نسخة UMD تحديدًا لأن الكود بيستخدم React كمتغيّر عام (مش import). */
const VENDOR_FILES = [
  ['react', 'umd/react.production.min.js'],
  ['react-dom', 'umd/react-dom.production.min.js'],
];

/* بنوصل لملف جوه حزمة عن طريق package.json بتاعها مش عن طريق المسار مباشرة:
   React بتعرّف حقل "exports" اللي بيقفل أي مسار جوه الحزمة مش مذكور فيه صراحة،
   ومجلد umd مش منهم - فـ require.resolve('react/umd/...') بيرمي خطأ. */
function resolveInPackage(pkg, relative) {
  const pkgJson = require.resolve(`${pkg}/package.json`, { paths: [BACKEND] });
  return path.join(path.dirname(pkgJson), relative);
}

const BANNER = '/* معاك (MA3ak) - ملف مبني تلقائيًا من frontend/build.js - متعدّلش فيه */\n';

function read(relPath) {
  return fs.readFileSync(path.join(FRONTEND, relPath), 'utf8');
}

function kb(text) {
  return (Buffer.byteLength(text, 'utf8') / 1024).toFixed(1) + ' KB';
}

async function buildCss() {
  const source = CSS_FILES.map((f) => `/* ===== ${f} ===== */\n${read(f)}`).join('\n');
  const { code } = await esbuild.transform(source, {
    loader: 'css',
    minify: true,
    charset: 'utf8',
  });
  const out = BANNER + code;
  fs.writeFileSync(path.join(DIST, 'app.css'), out);
  return { name: 'app.css', before: source, after: out };
}

async function buildJs() {
  const parts = [];
  for (const file of JS_FILES) {
    const { code } = await esbuild.transform(read(file), {
      loader: file.endsWith('.jsx') ? 'jsx' : 'js',
      charset: 'utf8',
      sourcefile: file,
    });
    parts.push(`/* ===== ${file} ===== */\n${code}`);
  }

  /* الملفات كانت بتتحمّل كوسوم <script> منفصلة، يعني كل تعريفاتها كانت بتعيش في
     النطاق العام. بعد الدمج بنلفّها في دالة تنفّذ نفسها: نفس السلوك بالظبط بالنسبة
     للكود (كله بيشوف بعضه)، بس من غير ما نلوّث window، وبيسمح للمصغّر إنه يقصّر
     أسماء الدوال والمتغيرات - وده اللي بيوفّر أكبر نسبة من الحجم. */
  const wrapped = `(function () {\n${parts.join('\n')}\n})();\n`;

  const { code } = await esbuild.transform(wrapped, {
    loader: 'js',
    minify: true,
    charset: 'utf8',
    /* es2017 مش أحدث: بيغطي أي متصفح من 2017 وطالع (كروم 55+، سفاري 11+).
       جمهور التطبيق كبار السن، ونسبة معتبرة منهم على أجهزة أندرويد قديمة. */
    target: 'es2017',
    legalComments: 'none',
  });

  const out = BANNER + code;
  fs.writeFileSync(path.join(DIST, 'app.js'), out);
  return { name: 'app.js', before: wrapped, after: out };
}

function buildVendor() {
  const source = VENDOR_FILES.map(([pkg, rel]) =>
    fs.readFileSync(resolveInPackage(pkg, rel), 'utf8')
  ).join('\n;\n');
  // مصغّرة أصلاً من React نفسها - إعادة تصغيرها مكسب صفر ومخاطرة بلا داعي
  fs.writeFileSync(path.join(DIST, 'vendor.js'), source);
  return { name: 'vendor.js', before: source, after: source };
}

async function build() {
  const started = Date.now();
  fs.mkdirSync(DIST, { recursive: true });

  const results = [buildVendor(), await buildCss(), await buildJs()];

  console.log(`\n📦 اتبنت الواجهة في ${Date.now() - started}ms\n`);
  for (const r of results) {
    const from = kb(r.before);
    const to = kb(r.after);
    console.log(`   dist/${r.name.padEnd(10)} ${from.padStart(9)} → ${to.padStart(9)}`);
  }
  console.log('');
}

/* ---------- وضع المتابعة: يعيد البناء مع كل حفظ ---------- */

function watch() {
  let timer = null;
  const rebuild = () => {
    clearTimeout(timer);
    // المحرّرات بتكتب الملف على أكتر من خطوة، فبنستنى شوية بدل ما نبني مرتين
    timer = setTimeout(() => {
      build().catch((e) => console.error('❌ فشل البناء:', e.message));
    }, 120);
  };

  for (const dir of ['js', 'css']) {
    fs.watch(path.join(FRONTEND, dir), { recursive: true }, rebuild);
  }
  console.log('👀 بيراقب frontend/js و frontend/css - اضغط Ctrl+C للخروج');
}

build()
  .then(() => {
    if (process.argv.includes('--watch')) watch();
  })
  .catch((e) => {
    console.error('❌ فشل البناء:', e);
    process.exit(1);
  });
