/* ============================================
   MA3ak (معاك) - Service Worker
   هدفه الوحيد: يخلي المتصفح "يعتبر" الموقع تطبيق قابل للتثبيت (installable)،
   ويحمّل قشرة التطبيق (HTML/CSS/JS) من الكاش بسرعة في الزيارة التانية.

   قاعدة مهمة: أي طلب لـ /api/* بيعدي زي ما هو من غير تدخل خالص - بيانات
   المريض (جرعات، مواعيد) لازم تيجي لايف من السيرفر دايمًا، مش من كاش قديم.
   ============================================ */

const CACHE_NAME = 'ma3ak-shell-v1';
const APP_SHELL = [
  '/',
  '/css/tokens.css',
  '/css/global.css',
  '/js/api.js',
  '/js/doseLogic.js',
  '/js/app.jsx',
  '/manifest.json',
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
            if (res.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, res.clone()));
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});
