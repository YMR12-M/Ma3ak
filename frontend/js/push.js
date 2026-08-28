/* ============================================
   MA3ak (معاك) - تفعيل التنبيهات على الجهاز (Web Push)

   الملف ده الوش الأمامي لأهم ميزة في التطبيق: إن التذكير يوصل **والتطبيق
   مقفول**. من غيره الرنة والإشعار بيشتغلوا بس والتاب مفتوح - وده مبيحصلش
   في الحياة الحقيقية.

   ---------- القيد اللي لازم تعرفه قبل ما تقرا أي سطر تحت ----------
   على iPhone/iPad، **الإشعارات مش شغالة في Safari العادي خالص**. لازم
   المستخدم يضيف التطبيق للشاشة الرئيسية الأول (مشاركة ← إضافة إلى الشاشة
   الرئيسية)، وبعدين يفتحه من هناك. ده قرار من آبل مش قصور فينا، ومفيش أي
   طريقة نلتف حواليه.

   عشان كده الدوال تحت بترجع "السبب" مش بس "ينفع/مينفعش" - الواجهة محتاجة
   تقول للمستخدم يعمل إيه بالظبط، مش تعرض زرار معطّل من غير تفسير.
   ============================================ */

/* مفتاح VAPID العام بيتبعت من السيرفر كنص base64url، والمتصفح عايزه بايتات خام.
   التحويل ده مطلوب حرفيًا في المواصفة - من غيره الاشتراك بيفشل برسالة غامضة. */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

/* بيرجع حالة التنبيهات على الجهاز ده بالتفصيل:
     status:
       'ready'         → مفعّلة وشغالة
       'off'           → متاحة بس المستخدم لسه مفعّلهاش
       'blocked'       → المستخدم رفض الإذن قبل كده (المتصفح مش هيسأله تاني)
       'needs-install' → آيفون: لازم يضيف التطبيق للشاشة الرئيسية الأول
       'unsupported'   → المتصفح مش بيدعم أصلاً
*/
function getPushStatus() {
  const hasApi = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  if (!hasApi) {
    /* آيفون في Safari العادي: الـ API مش موجود، لكن السبب مش "متصفح قديم" -
       السبب إن التطبيق مش متثبت. الرسالة الصح هنا بتفرق بين مستخدم يقدر يحل
       المشكلة في 10 ثواني ومستخدم مفيش قدامه حاجة يعملها. */
    if (isIOSDevice() && !isStandaloneDisplay()) return 'needs-install';
    return 'unsupported';
  }
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission === 'granted') return 'ready';
  return 'off';
}

// الاشتراك الحالي على الجهاز ده (لو موجود)
async function getCurrentPushSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  } catch (e) {
    return null;
  }
}

/* بيفعّل التنبيهات على الجهاز ده من الأول للآخر:
   إذن المستخدم → اشتراك عند خدمة الدفع → تسجيله عندنا.

   **لازم تتنادى من ضغطة مستخدم حقيقية.** المتصفحات بترفض (أو بتتجاهل في صمت)
   طلب الإذن اللي مش جاي من تفاعل - وده كان بيقفل الإشعارات بشكل دائم من غير
   ما المستخدم يشوف نافذة الإذن أصلاً.

   بيرمي Error برسالة عربية جاهزة للعرض - المستخدم لازم يعرف ليه مانفعش. */
async function enablePush() {
  const status = getPushStatus();
  if (status === 'needs-install') {
    throw new Error('على الآيفون لازم تضيف التطبيق للشاشة الرئيسية الأول، وتفتحه من هناك');
  }
  if (status === 'unsupported') {
    throw new Error('المتصفح ده مش بيدعم التنبيهات');
  }
  if (status === 'blocked') {
    throw new Error('التنبيهات موقوفة من إعدادات المتصفح - فعّلها من هناك وارجع تاني');
  }

  const { publicKey, enabled } = await api.getPushPublicKey();
  if (!enabled || !publicKey) {
    throw new Error('خدمة التنبيهات مش مفعّلة على السيرفر دلوقتي');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('لازم تسمح بالتنبيهات عشان التطبيق يفكّرك');
  }

  const registration = await navigator.serviceWorker.ready;

  /* لو فيه اشتراك قديم بمفتاح مختلف (السيرفر غيّر مفاتيح VAPID) لازم يتلغي
       الأول - المتصفح بيرفض subscribe بمفتاح تاني على نفس التسجيل. */
  const existing = await registration.pushManager.getSubscription();
  if (existing) await existing.unsubscribe().catch(() => {});

  const subscription = await registration.pushManager.subscribe({
    // إجباري يكون true في كل المتصفحات الحديثة: يعني "كل رسالة هتعرض إشعار
    // للمستخدم" - ممنوع نستخدم القناة دي في حاجة خفية
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  await api.subscribePush(subscription.toJSON());
  return subscription;
}

async function disablePush() {
  const subscription = await getCurrentPushSubscription();
  if (!subscription) return;
  // بنشيله من عندنا الأول: لو الإلغاء عند المتصفح نجح والتسجيل عندنا فشل،
  // بنفضل بنبعت لعنوان ميت لحد ما يفشل 5 مرات
  await api.unsubscribePush(subscription.endpoint).catch(() => {});
  await subscription.unsubscribe().catch(() => {});
}

/* بيتنادى بعد تسجيل الدخول: لو المستخدم مفعّل الإشعارات على الجهاز ده،
   بنتأكد إن السيرفر عارف الاشتراك الحالي.

   ليه ده مش زيادة: عناوين الاشتراك (endpoint) بتتغيّر من نفسها - المتصفح
   بيجددها، والمستخدم ممكن يمسح بيانات الموقع. وكمان الجهاز الواحد ممكن يكون
   عليه أكتر من حساب (المتابع دخل على موبايل المريض). من غير المزامنة دي
   الاشتراك بيفضل مسجّل لحساب غلط أو لعنوان ميت، والتنبيه بيروح في السكة.

   بيفشل في صمت عن قصد: ده تحسين خلفي، مش حاجة المستخدم طلبها. */
async function syncPushSubscription() {
  if (getPushStatus() !== 'ready') return;
  try {
    const subscription = await getCurrentPushSubscription();
    if (subscription) await api.subscribePush(subscription.toJSON());
  } catch (e) {
    /* صامت */
  }
}
