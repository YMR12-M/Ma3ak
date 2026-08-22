/* ============================================
   MA3ak (معاك) - Service Worker
   هدفه الوحيد: يخلي المتصفح "يعتبر" الموقع تطبيق قابل للتثبيت (installable)،
   ويحمّل قشرة التطبيق (HTML/CSS/JS) من الكاش بسرعة في الزيارة التانية.

   قاعدة مهمة: أي طلب لـ /api/* بيعدي زي ما هو من غير تدخل خالص - بيانات
   المريض (جرعات، مواعيد) لازم تيجي لايف من السيرفر دايمًا، مش من كاش قديم.
   ============================================ */

/* لازم يتغيّر الرقم ده مع أي تعديل في قايمة APP_SHELL تحت - هو اللي بيخلي
   المتصفح يرمي الكاش القديم ويحمّل النسخة الجديدة (شوف حدث activate تحت). */
const CACHE_NAME = 'ma3ak-shell-v3';

/* قشرة التطبيق كاملة. مهم: لازم تشمل كل ملفات المكوّنات كمان - قبل كده كانت
   القايمة فيها app.jsx بس من غير الـ 11 ملف اللي بيعرّفوا كل المكوّنات، يعني
   لو حد فتح التطبيق أول مرة وهو أوفلاين كان بيلاقي صفحة بيضا: الملفات
   الأساسية موجودة في الكاش بس المكوّنات اللي بترسم الشاشة مش موجودة. */
const APP_SHELL = [
  '/',
  '/manifest.json',
  '/css/tokens.css',
  '/css/base.css',
  '/css/animations.css',
  '/css/components.css',
  '/css/layout.css',
  '/css/auth.css',
  '/css/screens.css',
  '/css/patient.css',
  '/js/api.js',
  '/js/doseLogic.js',
  '/js/app.jsx',
  '/js/components/Common.jsx',
  '/js/components/Settings.jsx',
  '/js/components/Auth.jsx',
  '/js/components/Layout.jsx',
  '/js/components/Dashboard.jsx',
  '/js/components/Medications.jsx',
  '/js/components/Appointments.jsx',
  '/js/components/Vitals.jsx',
  '/js/components/Notifications.jsx',
  '/js/components/Patients.jsx',
  '/js/components/PatientHome.jsx',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {
      /* لو أي ملف فشل يتحمّل مسبقًا، السيرفس ووركر يتسجل برضه - مش لازم يوقف كل حاجة */
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API وطلبات مش GET (POST/PUT/DELETE): تعدي زي ما هي، من غير أي كاش خالص
  if (url.pathname.startsWith('/api/') || event.request.method !== 'GET') {
    return;
  }

  // باقي الطلبات (نفس الأصل بس): كاش أول حاجة، وبالتوازي بنجيب نسخة جديدة من
  // الشبكة ونحدّث بيها الكاش لزيارة بعد كده (stale-while-revalidate)
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const network = fetch(event.request)
          .then((res) => {
            // النسخة لازم تتاخد **دلوقتي حالًا**، مش جوه الـ then بتاعة caches.open:
            // لحد ما الـ promise دي تخلص، الصفحة تكون خلاص قرت جسم الرد الأصلي،
            // وclone() على رد اتقرا بيرمي TypeError - فالكاش كان بيفضل قديم للأبد
            // (أي تعديل في CSS أو JS ما كانش بيوصل للمستخدم إلا بمسح بيانات الموقع).
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});
