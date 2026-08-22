/* ============================================
   MA3ak (معاك) - Service Worker
   هدفه الوحيد: يخلي المتصفح "يعتبر" الموقع تطبيق قابل للتثبيت (installable)،
   ويحمّل قشرة التطبيق (HTML/CSS/JS) من الكاش بسرعة في الزيارة التانية.

   قاعدة مهمة: أي طلب لـ /api/* بيعدي زي ما هو من غير تدخل خالص - بيانات
   المريض (جرعات، مواعيد) لازم تيجي لايف من السيرفر دايمًا، مش من كاش قديم.
   ============================================ */

/* لازم يتغيّر الرقم ده مع أي تعديل في قايمة APP_SHELL تحت - هو اللي بيخلي
   المتصفح يرمي الكاش القديم ويحمّل النسخة الجديدة (شوف حدث activate تحت). */
const CACHE_NAME = 'ma3ak-shell-v6';

/* قشرة التطبيق كاملة - بقت 5 ملفات بدل 26.
   قبل كده كان كل ملف CSS وكل ملف مكوّن بيتكاشّ لوحده، لأن المتصفح كان بيحمّلهم
   كلهم واحد واحد. دلوقتي البناء (frontend/build.js) بيدمجهم في تلات ملفات جوه
   dist/، فالقايمة هنا بقت هي دي بالظبط.
   مهم: ملفات المصدر (js/*.jsx و css/*.css) **مش** مفروض تتحط هنا - المتصفح
   مبيطلبهاش أصلاً، والـ dist هو اللي بيتحمّل فعليًا. */
const APP_SHELL = [
  '/',
  '/manifest.json',
  '/dist/app.css',
  '/dist/vendor.js',
  '/dist/app.js',
  // الخطوط بقت مستضافة عندنا، فبتتكاش زي أي ملف تاني - يعني التطبيق أوفلاين
  // بيفضل بخطه الحقيقي بدل ما يقع على خط النظام
  '/fonts/cairo-arabic.woff2',
  '/fonts/cairo-latin.woff2',
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
