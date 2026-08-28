require('dotenv').config();
const path = require('path');
const express = require('express');
const compression = require('compression');
const helmet = require('helmet');

// من غير JWT_SECRET حقيقي وطويل، أي توكن ممكن يتزور. نوقف السيرفر بدل ما يشتغل بمفتاح ضعيف من غير ما نحس.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error(
    '❌ JWT_SECRET مش موجود في .env أو قصير جدًا. حط قيمة عشوائية طويلة (16 حرف على الأقل) وشغّل تاني.\n' +
      '   تقدر تولّد واحدة بالأمر: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
  );
  process.exit(1);
}

const authRoutes = require('./routes/auth');
const patientsRoutes = require('./routes/patients');
const medicationsRoutes = require('./routes/medications');
const dosesRoutes = require('./routes/doses');
const appointmentsRoutes = require('./routes/appointments');
const vitalsRoutes = require('./routes/vitals');
const notificationsRoutes = require('./routes/notifications');
const pushRoutes = require('./routes/push');
const { errorHandler } = require('./middleware/errors');
const { startScheduler } = require('./scheduler');

const app = express();

/* على Render (وأي استضافة بتحط بروكسي قدام التطبيق) كل الطلبات بتوصل السيرفر
   من IP البروكسي نفسه، مش من IP المستخدم الحقيقي. من غير السطر ده، express-rate-limit
   بيشوف كل المستخدمين كأنهم شخص واحد - يعني 10 محاولات دخول فاشلة من أي حد كانت
   بتقفل تسجيل الدخول على كل المستخدمين لمدة 15 دقيقة. الرقم 1 معناه "اثق في أول
   بروكسي قدامي بس" - مش أكتر، عشان محدش يقدر يزوّر X-Forwarded-For ويتهرب من الحد. */
app.set('trust proxy', 1);

/* هيدرات الأمان. التطبيق بيعرض بيانات مرضى وبيخزّن توكن الدخول في
   localStorage، فأي XSS بيتحوّل لاستيلاء كامل على الحساب - والـ CSP هي الطبقة
   اللي بتمنع ده حتى لو ثغرة عدّت.

   كل أصول الواجهة مستضافة عندنا (الخطوط جوه /fonts، مفيش CDN)، فالسياسة
   بتقدر تبقى ضيقة من غير أي عناء:
     - default-src 'self'  → مفيش أي حاجة من برّه أصلاً
     - script-src 'self' + hashes → شوف INLINE_SCRIPT_HASHES تحت
     - img-src بيسمح بـ data: عشان صور الأدوية بتيجي كـ data URL جوه JSON
     - connect-src 'self'  → الـ API بس، ولا حتى الـ Service Worker بيكلّم برّه
     - frame-ancestors 'none' → التطبيق ما ينفعش يتحط جوه iframe (clickjacking)

   crossOriginEmbedderPolicy مقفولة: بتكسر تحميل بعض الموارد من غير أي مكسب هنا.
   HSTS شغّالة بالافتراضي وRender بيقدّم HTTPS، فمفيش حاجة تتظبط. */

/* في index.html سكريبتين inline مالهمش بديل حقيقي: واحد بيحدد المظهر **قبل أول
   رسم** (من غيره المستخدم اللي مختار الوضع الداكن بيشوف ومضة بيضا)، وواحد
   بيسجّل الـ Service Worker. نقلهم لملف خارجي بيلغي فايدة الأول بالكامل - لازم
   يتنفّذ قبل أي تحميل شبكة.

   فبدل ما نفتح 'unsafe-inline' (اللي بيلغي أهم حماية في الـ CSP كلها)، بنحسب
   بصمة SHA-256 لكل سكريبت منهم وقت الإقلاع ونضيفها للسياسة. الحساب من الملف
   نفسه مش رقم مكتوب بالإيد، فأي تعديل في السكريبتات دي بيشتغل لوحده من غير ما
   حد يفتكر يحدّث حاجة - ومستحيل تفضل بصمة قديمة تسمح بكود اتغيّر. */
function inlineScriptHashes() {
  try {
    const html = require('fs').readFileSync(
      path.join(__dirname, '../frontend/index.html'),
      'utf8'
    );
    const hashes = [];
    // بيمسك محتوى أي <script> من غير src
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = re.exec(html)) !== null) {
      const digest = require('crypto').createHash('sha256').update(match[1], 'utf8').digest('base64');
      hashes.push(`'sha256-${digest}'`);
    }
    return hashes;
  } catch (e) {
    console.error('⚠️ مقدرناش نقرا index.html لحساب بصمات السكريبتات:', e.message);
    return [];
  }
}

const INLINE_SCRIPT_HASHES = inlineScriptHashes();

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", ...INLINE_SCRIPT_HASHES],
        // 'unsafe-inline' للـ style بس: React بيكتب style مباشرة على العناصر
        // (زي --progress في حلقة التقدّم)، وده مبيتعملوش nonce
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        manifestSrc: ["'self'"],
        workerSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'same-origin' },
  })
);

/* ضغط الردود (gzip/brotli حسب اللي المتصفح بيقبله).
   الواجهة كلها نصوص: CSS مبني 184 كيلو، وجافاسكريبت 370 كيلو - والنص بيتضغط
   لحوالي رُبع حجمه. الملفات دي مكتوبة مقروءة مش مصغّرة، يعني الضغط هنا مش
   تحسين إضافي - هو اللي بيخلي الحجم معقول أصلاً. من غير السطر ده كل مستخدم
   كان بينزّل الحجم الكامل، وده بيبان بالذات على بيانات الموبايل البطيئة اللي
   أغلب مستخدمينا عليها. */
app.use(compression());

/* حد أقصى لحجم الطلب - من غيره حد يقدر يبعت ميجابايتات ويستهلك ذاكرة السيرفر.

   الاستثناء الوحيد: رفع صورة الدوا. الصورة أكبر من أي جسم طلب تاني في التطبيق
   بمراحل، وليها محلّل خاص بحد أوسع في routes/medications.js. من غير التخطي ده
   المحلّل العام كان هيرفضها هنا **قبل** ما توصل للـ route أصلاً - والرسالة
   اللي المستخدم هيشوفها هتبقى "البيانات المبعوتة مش بصيغة صحيحة" بدل
   "الصورة كبيرة أوي"، وده خطأ بيوّدي في اتجاه غلط تمامًا.

   الاستثناء ضيق عن قصد: مسار واحد بالظبط وميثود واحدة - مش نمط واسع يفتح
   الباب لأي حاجة تانية تعدّي بحجم كبير من غير ما حد ياخد باله. */
const parseSmallJson = express.json({ limit: '100kb' });
const MEDICATION_IMAGE_PATH = /^\/api\/medications\/\d+\/image$/;

app.use((req, res, next) => {
  if (req.method === 'PUT' && MEDICATION_IMAGE_PATH.test(req.path)) return next();
  parseSmallJson(req, res, next);
});

/* الملفات الثابتة. الافتراضي في express.static إن كل ملف بيتراجع مع السيرفر
   في كل زيارة (طلب بيرجع 304 فاضي) - ده أمان زيادة عن اللزوم لملفات زي
   الأيقونات اللي عمرها ما بتتغير. فبنفرّق:
     - أيقونات: سنة كاملة، مبتتغيّرش أصلاً.
     - dist/ و CSS/JS: يوم واحد + must-revalidate، عشان أي نشر جديد يوصل
       للمستخدم بسرعة. والـ Service Worker بيغطي السرعة في الزيارات المتكررة.
     - index.html و sw.js: ممنوع الكاش نهائيًا - الاتنين دول هما اللي بيقولوا
       للمتصفح إن فيه نسخة جديدة، فلو اتكاشوا المستخدم بيعلق على نسخة قديمة. */
app.use(
  express.static(path.join(__dirname, '../frontend'), {
    setHeaders(res, filePath) {
      const name = path.basename(filePath);
      if (name === 'index.html' || name === 'sw.js') {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (
        filePath.includes(`${path.sep}icons${path.sep}`) ||
        filePath.includes(`${path.sep}fonts${path.sep}`)
      ) {
        // أيقونات وخطوط: ملفات ثابتة باسم ثابت، لو اتغيّر محتواها بيتغيّر اسمها
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=86400, must-revalidate');
      }
    },
  })
);

app.use('/api/auth', authRoutes);
app.use('/api/patients', patientsRoutes);
app.use('/api/medications', medicationsRoutes);
app.use('/api/doses', dosesRoutes);
app.use('/api/appointments', appointmentsRoutes);
app.use('/api/vitals', vitalsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/push', pushRoutes);

// أي مسار API مش موجود
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'المسار غير موجود' });
});

/* أي طلب تاني (SPA): يرجع index.html - عشان مسارات زي /access/<token> تشتغل
   لما المستخدم يفتحها مباشرة. بس بشرط: لو المسار شكله ملف (فيه امتداد زي .js أو
   .css) ووصل لهنا، يبقى express.static ملقاهوش - فده 404 حقيقي مش مسار SPA.
   من غير التفرقة دي، أي خطأ مطبعي في اسم سكريبت كان بيرجع صفحة HTML بكود 200،
   والمتصفح كان بيحاول ينفذها كـ JavaScript ويطلّع خطأ صياغة غامض بدل 404 واضح. */
app.get('*', (req, res) => {
  if (path.extname(req.path)) {
    return res.status(404).type('txt').send('الملف ده مش موجود');
  }
  // نفس قاعدة index.html فوق: مسارات الـ SPA (زي /access/<token>) بترجع نفس
  // الصفحة، فلازم تاخد نفس الهيدر - من غيره المتصفح ممكن يكاشها بمسارها
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// لازم يتسجل بعد كل الـ routes - Express بيعرف إنه معالج أخطاء من عدد باراميتراته (4)
app.use(errorHandler);

// بيتصدّر عشان التيستات تقدر تشغّله على بورت عشوائي (http.createServer(app).listen(0))
// من غير ما تستدعي app.listen ولا الـ scheduler فعليًا. لما الملف يتشغّل مباشرة (node server.js)
// require.main بيبقى هو نفسه، فالسيرفر بيشتغل عادي زي أي وقت.
module.exports = app;

if (require.main === module) {
  /* شبكة أمان أخيرة: لو فضل أي رفض غير ممسوك في أي مكان (مثلاً جوه الـ scheduler)،
     السلوك الافتراضي لـ Node إنه يقتل العملية - يعني التطبيق يقع على كل المستخدمين.
     في تطبيق بيفكّر ناس بدوائهم، فضل شغال وسجّل الخطأ أفضل بكتير من إنه يقع.
     ملحوظة: ده مش بديل عن asyncHandler - كل الـ routes ملفوفة بيه فعلاً، وده
     بس للحالات اللي ممكن تفوت. */
  process.on('unhandledRejection', (reason) => {
    console.error('⚠️ رفض غير ممسوك (السيرفر كمّل شغل):', reason);
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🤝 MA3ak server running on http://localhost:${PORT}`);
    startScheduler();
  });
}
