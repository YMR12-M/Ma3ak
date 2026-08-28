/* ============================================
   MA3ak (معاك) - Service Worker

   ليه هو أهم ملف في التطبيق دلوقتي:
   ده الحتة الوحيدة من الكود اللي بتشتغل **والتطبيق مقفول**. الصفحة نفسها
   (React، الرنة، الـ polling) كلها بتموت بمجرد ما المستخدم يقفل التاب - وده
   الوضع الطبيعي 99% من الوقت. الـ Service Worker بيفضل عايش عند المتصفح،
   فهو اللي بيستقبل تنبيه الجرعة ويعرضه، وهو اللي بينفّذ ضغطة "خدته".

   مسؤولياته التلاتة:
     1. كاش قشرة التطبيق (كان ده دوره الوحيد قبل كده)
     2. استقبال الـ Web Push وعرض الإشعار
     3. تنفيذ أزرار الإشعار (خدته / فكّرني بعدين) من غير ما التطبيق يتفتح أصلاً

   قاعدة مهمة: أي طلب لـ /api/* بيعدي زي ما هو من غير تدخل خالص - بيانات
   المريض (جرعات، مواعيد) لازم تيجي لايف من السيرفر دايمًا، مش من كاش قديم.
   ============================================ */

/* لازم يتغيّر الرقم ده مع أي تعديل في قايمة APP_SHELL تحت - هو اللي بيخلي
   المتصفح يرمي الكاش القديم ويحمّل النسخة الجديدة (شوف حدث activate تحت). */
const CACHE_NAME = 'ma3ak-shell-v8';

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


/* ============================================
   استقبال الـ Web Push
   ============================================ */

/* أيقونة الإشعار وشارته. الأيقونة بتبان جنب النص، والشارة (badge) هي الشكل
   الأبيض والأسود الصغير اللي بيظهر في شريط الحالة على أندرويد. */
const NOTIF_ICON = '/icons/icon-192.png';
const NOTIF_BADGE = '/icons/icon-192.png';

/* نمط الاهتزاز حسب الأهمية. الفرق مقصود: كبير السن بيتعوّد على الإيقاع نفسه،
   فالنبضة الطويلة المتكررة بتقول "دي مش زي كل مرة" من غير ما يقرا حاجة. */
const VIBRATE_CRITICAL = [400, 150, 400, 150, 400, 150, 400];
const VIBRATE_NORMAL = [300, 150, 300];

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    // حمولة مش JSON (اختبار من أداة خارجية مثلاً) - نعرض اللي فيها كنص
    payload = { title: 'معاك', body: (event.data && event.data.text()) || '' };
  }

  const isCritical = payload.priority === 'critical';

  const options = {
    body: payload.body || '',
    icon: NOTIF_ICON,
    badge: NOTIF_BADGE,
    lang: 'ar',
    dir: 'rtl',
    tag: payload.tag || 'ma3ak',
    /* renotify مع tag ثابت: الإشعار الجديد بيحل محل القديم **وبيرن تاني**.
       من غيرها التذكير التاني بيستبدل الأول في صمت - يعني المريض اللي فات عليه
       الأول مش هياخد باله من التاني خالص. */
    renotify: true,
    /* الإشعار الحرج بيفضل على الشاشة لحد ما المستخدم يتصرف، مبيختفيش لوحده
       بعد ثواني. تنبيه جرعة أنسولين مالوش لازمة لو اختفى قبل ما حد يشوفه. */
    requireInteraction: isCritical,
    vibrate: isCritical ? VIBRATE_CRITICAL : VIBRATE_NORMAL,
    actions: (payload.actions || []).slice(0, 2), // المتصفحات بتعرض زرارين بحد أقصى
    data: {
      url: payload.url || '/',
      notificationId: payload.notificationId || null,
      ackToken: payload.ackToken || null,
      type: payload.type || null,
      ...(payload.data || {}),
    },
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(payload.title || 'معاك', options),
      // إثبات وصول: من غيره مفيش طريقة نعرف بيها إن الدفع بيفشل بصمت
      sendAck(payload.ackToken, 'delivered'),
    ])
  );
});

/* بيقول للسيرفر "الإشعار ده وصل / اتداس عليه".
   بيستخدم توكن جه مع الإشعار نفسه، مش توكن الدخول - الـ Service Worker مش
   بيقدر يقرا localStorage أصلاً. عمرها ما بترمي: فشل التسجيل ده مالوش لازمة
   يعطّل عرض الإشعار نفسه. */
function sendAck(ackToken, event) {
  if (!ackToken) return Promise.resolve();
  return fetch('/api/notifications/ack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: ackToken, event }),
  }).catch(() => {});
}

/* ============================================
   الضغط على الإشعار وأزراره
   ============================================ */

/* بينفّذ فعل الجرعة (خدته / فكّرني بعدين) من غير ما التطبيق يتفتح.

   دي أهم دالة في الملف: من غيرها المريض لازم يفتح التطبيق ويدوّر على الجرعة
   عشان يقول "خدتها" - وكبير سن مش هيعمل الرحلة دي، فالميزة كلها بتتجاهل.
   الضغطة لازم تكون في نفس المكان اللي شاف فيه التنبيه.

   بيرجع رسالة قصيرة نعرضها كإشعار تأكيد، عشان المريض يشوف إن دوسته وصلت
   فعلاً - من غير التأكيد ده هو مش هيعرف حصل إيه ويدوس تاني وتالت. */
async function runDoseAction(action, data) {
  if (!data || !data.actionToken) {
    return { ok: false, message: 'التنبيه ده انتهت صلاحيته - افتح التطبيق' };
  }
  try {
    const res = await fetch('/api/doses/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: data.actionToken, action }),
    });
    const body = await res.json().catch(() => null);

    if (!res.ok) {
      return { ok: false, message: (body && body.error) || 'مقدرناش نسجّل - افتح التطبيق' };
    }
    if (action === 'take') {
      return { ok: true, message: `تمام، سجّلنا إنك خدت ${data.medName || 'الدوا'} ✅` };
    }
    const minutes = (body && body.minutes) || data.snoozeMinutes || 10;
    const left = body && typeof body.snoozes_left === 'number' ? body.snoozes_left : null;
    return {
      ok: true,
      message:
        `هنفكّرك تاني بعد ${minutes} دقايق` +
        (left === 0 ? ' - دي آخر مرة نأجّلها' : ''),
    };
  } catch (e) {
    // النت قاطع: المريض لازم يعرف إن الفعل مانفعش، مش يفتكر إنه اتسجّل
    return { ok: false, message: 'مفيش نت - افتح التطبيق وسجّلها' };
  }
}

// بيفتح التطبيق: بيركّز تاب مفتوح لو فيه، وبيفتح واحد جديد لو مفيش.
// بنعيد استخدام التاب المفتوح عشان المريض ما يلاقيش 5 نسخ من التطبيق مفتوحة
// بعد 5 تنبيهات.
async function openApp(url, data = {}) {
  const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clientList) {
    if ('focus' in client) {
      /* بنبلّغ الصفحة إنها اتفتحت من إشعار عشان تحدّث بياناتها فورًا بدل ما
         تفضل عارضة حالة قديمة لحد دورة التحديث الجاية.

         و doseId مهم بالذات على iOS: سفاري **مبيعرضش أزرار الإشعار خالص**
         (قرار من آبل)، فزرار "خدته" مش موجود عند المريض على آيفون - كل اللي
         يقدر يعمله إنه يدوس على الإشعار نفسه. فبنفتح له شاشة المنبه للجرعة
         دي على طول بدل ما نسيبه يدوّر عليها في الشاشة. */
      client.postMessage({ type: 'ma3ak:notification-click', url, doseId: data.doseId || null });
      return client.focus();
    }
  }
  /* مفيش تاب مفتوح: بنفتح واحد على مسار فيه رقم الجرعة، والتطبيق بيقراه لحظة
     الإقلاع (نفس فكرة /access/<token>). */
  const target = data.doseId ? `/?dose=${data.doseId}` : url || '/';
  return self.clients.openWindow(target);
}

self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data || {};
  event.notification.close();

  event.waitUntil(
    (async () => {
      await sendAck(data.ackToken, 'clicked');

      // زرار من جوه الإشعار: ننفّذ الفعل ونعرض تأكيد، من غير ما نفتح التطبيق
      if (event.action === 'take' || event.action === 'snooze') {
        const result = await runDoseAction(event.action, data);
        await self.registration.showNotification(result.ok ? 'معاك ✅' : 'معاك ⚠️', {
          body: result.message,
          icon: NOTIF_ICON,
          badge: NOTIF_BADGE,
          lang: 'ar',
          dir: 'rtl',
          tag: data.doseId ? `dose-${data.doseId}` : 'ma3ak-result',
          // التأكيد مش محتاج يهتز تاني - المريض ماسك التليفون في إيده أصلاً
          silent: true,
        });

        /* لو الفعل فشل، بنفتح التطبيق كمان: المريض لازم يلاقي طريق يكمّل بيه،
           مش رسالة خطأ وخلاص. */
        if (!result.ok) await openApp(data.url || '/', data);

        // الصفحة (لو مفتوحة) لازم تعرف إن الحالة اتغيّرت من برّه
        const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        clientList.forEach((c) => c.postMessage({ type: 'ma3ak:dose-changed', doseId: data.doseId }));
        return;
      }

      // دوسة على جسم الإشعار نفسه: نفتح التطبيق (وعلى الجرعة لو الإشعار جرعة)
      await openApp(data.url || '/', data);
    })()
  );
});
