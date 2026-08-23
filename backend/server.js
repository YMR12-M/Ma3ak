require('dotenv').config();
const path = require('path');
const express = require('express');
const compression = require('compression');

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
const { errorHandler } = require('./middleware/errors');
const { startScheduler } = require('./scheduler');

const app = express();

/* على Render (وأي استضافة بتحط بروكسي قدام التطبيق) كل الطلبات بتوصل السيرفر
   من IP البروكسي نفسه، مش من IP المستخدم الحقيقي. من غير السطر ده، express-rate-limit
   بيشوف كل المستخدمين كأنهم شخص واحد - يعني 10 محاولات دخول فاشلة من أي حد كانت
   بتقفل تسجيل الدخول على كل المستخدمين لمدة 15 دقيقة. الرقم 1 معناه "اثق في أول
   بروكسي قدامي بس" - مش أكتر، عشان محدش يقدر يزوّر X-Forwarded-For ويتهرب من الحد. */
app.set('trust proxy', 1);

/* ضغط الردود (gzip/brotli حسب اللي المتصفح بيقبله).
   الواجهة كلها نصوص: CSS مبني 184 كيلو، وجافاسكريبت 370 كيلو - والنص بيتضغط
   لحوالي رُبع حجمه. الملفات دي مكتوبة مقروءة مش مصغّرة، يعني الضغط هنا مش
   تحسين إضافي - هو اللي بيخلي الحجم معقول أصلاً. من غير السطر ده كل مستخدم
   كان بينزّل الحجم الكامل، وده بيبان بالذات على بيانات الموبايل البطيئة اللي
   أغلب مستخدمينا عليها. */
app.use(compression());

// حد أقصى لحجم الطلب - من غيره حد يقدر يبعت ميجابايتات ويستهلك ذاكرة السيرفر
app.use(express.json({ limit: '100kb' }));

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
