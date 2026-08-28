/* ============================================
   MA3ak (معاك) - توكن الأفعال اللي جوّه الإشعار

   المشكلة اللي بيحلها:
   أهم زرار في التطبيق كله هو "خدت الدوا" - ولازم يشتغل **من جوّه الإشعار نفسه**،
   من غير ما المريض يفتح التطبيق ويدوّر على الجرعة. كبير سن مش هيعمل الرحلة دي،
   وأي خطوة زيادة هنا معناها إن الميزة تتجاهل.

   لكن الفعل ده بيحصل جوه الـ Service Worker، والـ SW **مش بيقدر يقرا
   localStorage** (مفيش عنده وصول ليها أصلاً - بيشتغل في سياق منفصل عن الصفحة).
   يعني توكن الدخول العادي مش متاح له.

   الحل: مع كل إشعار جرعة بنبعت "توكن فعل" صغير جوه حمولة الإشعار - توكن موقّع
   بيقول حاجة واحدة بس: "حامل الورقة دي مسموح له يسجّل الجرعة رقم كذا للمستخدم
   رقم كذا، لحد ساعة كذا". مش توكن دخول: مبيفتحش أي بيانات، مبيقراش حاجة،
   ومربوط بجرعة واحدة بعينها وبينتهي بسرعة.

   ليه ده أأمن من إننا نخزّن توكن الدخول في مكان الـ SW يشوفه:
   لو حد وصل للتوكن ده بأي طريقة، أقصى ضرر ممكن يعمله إنه يسجّل جرعة واحدة
   كـ"اتاخدت" - مش يقرا بيانات المريض ولا يعدّل أدويته ولا يدخل حسابه.
   ============================================ */

const jwt = require('jsonwebtoken');

// صلاحية قصيرة: التوكن ده مالوش لازمة بعد ما ميعاد الجرعة يعدي بساعات.
// 6 ساعات بتغطي مريض نام على الإشعار وصحي عليه، من غير ما يفضل صالح لبكرة.
const ACTION_TTL_SECONDS = 6 * 60 * 60;

// علامة بتميّز التوكنات دي عن توكنات الدخول العادية. من غيرها، توكن دخول عادي
// كان هيعدّي من verifyDoseAction (نفس المفتاح بيوقّع الاتنين) - والعكس:
// توكن الفعل ده مايقدرش يعدّي من authRequired لأنه مفيهوش id/role أصلاً.
const KIND = 'dose_action';

function signDoseAction(userId, doseId) {
  return jwt.sign({ kind: KIND, uid: userId, doseId }, process.env.JWT_SECRET, {
    expiresIn: ACTION_TTL_SECONDS,
  });
}

/* بيرجع { uid, doseId } لو التوكن سليم، أو null لو مش سليم/منتهي/من نوع تاني.
   بيرجع null بدل ما يرمي عشان الـ route يرد 401 نضيفة من غير try/catch عنده. */
function verifyDoseAction(token) {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.kind !== KIND) return null;
    if (!payload.uid || !payload.doseId) return null;
    return { uid: payload.uid, doseId: payload.doseId };
  } catch (e) {
    return null;
  }
}

/* ---------- توكن إثبات التوصيل ----------
   نفس الفكرة بالظبط، بس لغرض تاني: الـ Service Worker محتاج يقول للسيرفر
   "الإشعار ده وصل فعلاً" و"المستخدم دوس عليه" - وده مصدر سجل التوصيل اللي
   من غيره مفيش طريقة تعرف إن الدفع بيفشل بصمت.

   وبرضه: الـ SW مش شايف توكن الدخول. فبنبعت مع كل إشعار توكن صغير بيسمح بحاجة
   واحدة: تعليم الإشعار ده (بالرقم ده بالذات) كـ"اتوصّل" أو "اتداس عليه".
   مالوش أي قيمة تانية لو اتسرب. */
const ACK_KIND = 'notif_ack';
// أطول من توكن الفعل: إشعار ممكن يفضل في شريط الإشعارات ليوم كامل قبل ما
// المستخدم يدوس عليه، ولسه عايزين نسجّل الدوسة دي
const ACK_TTL_SECONDS = 48 * 60 * 60;

function signAck(notificationId) {
  return jwt.sign({ kind: ACK_KIND, nid: notificationId }, process.env.JWT_SECRET, {
    expiresIn: ACK_TTL_SECONDS,
  });
}

function verifyAck(token) {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.kind !== ACK_KIND || !payload.nid) return null;
    return { notificationId: payload.nid };
  } catch (e) {
    return null;
  }
}

module.exports = { signDoseAction, verifyDoseAction, signAck, verifyAck, ACTION_TTL_SECONDS, ACK_TTL_SECONDS };
