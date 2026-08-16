/* ============================================
   MA3ak (معاك) - إمساك الأخطاء في مكان واحد

   المشكلة اللي الملف ده بيحلها: كل الـ routes دوال async، وExpress 4 مش بيمسك
   الـ Promise المرفوض لوحده. يعني أي خطأ من قاعدة البيانات (تاريخ بايظ، نص أطول
   من العمود، اتصال اتقطع) كان بيطلع كـ"unhandled rejection"، وNode بيقتل العملية
   كلها - التطبيق بيقع على كل المستخدمين بسبب طلب واحد غلط من مستخدم واحد.

   الحل جزئين:
   1) asyncHandler: بيلف كل هاندلر async ويحوّل أي رفض لـ next(err) عادي.
   2) errorHandler: ميدل وير أخير بيترجم الخطأ لرد JSON مفهوم بالعربي،
      وبيسجّل التفاصيل التقنية في اللوج بس - من غير ما يسرّبها للمستخدم.
   ============================================ */

// بيلف هاندلر async عشان أي استثناء جواه يروح لـ errorHandler بدل ما يوقّع السيرفر
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/* أخطاء قاعدة البيانات اللي سببها مدخلات المستخدم مش عطل في السيرفر - دي المفروض
   ترجع 400/409 (غلط من العميل) مش 500. التحقق في utils/validate.js المفروض يمسك
   معظمها قبل ما توصل هنا، وده خط الدفاع الأخير لأي حالة فاتت. */
const DB_ERROR_MAP = {
  ER_DUP_ENTRY: { status: 409, message: 'البيانات دي مسجلة قبل كده' },
  ER_DATA_TOO_LONG: { status: 400, message: 'البيانات اللي اتكتبت أطول من المسموح' },
  ER_TRUNCATED_WRONG_VALUE: { status: 400, message: 'فيه قيمة مكتوبة بصيغة غير صحيحة (تاريخ أو رقم)' },
  ER_WRONG_VALUE: { status: 400, message: 'فيه قيمة مكتوبة بصيغة غير صحيحة' },
  ER_INVALID_JSON_TEXT: { status: 400, message: 'فيه بيانات مبعوتة بصيغة غير صحيحة' },
  ER_BAD_NULL_ERROR: { status: 400, message: 'فيه بيانات ناقصة مطلوبة' },
  ER_NO_REFERENCED_ROW: { status: 400, message: 'البيانات مرتبطة بسجل مش موجود' },
  ER_NO_REFERENCED_ROW_2: { status: 400, message: 'البيانات مرتبطة بسجل مش موجود' },
};

// أعطال اتصال حقيقية بقاعدة البيانات - مش غلطة المستخدم، والرد الصح 503 مش 500
const DB_DOWN_CODES = new Set([
  'ECONNREFUSED',
  'PROTOCOL_CONNECTION_LOST',
  'ER_CON_COUNT_ERROR',
  'ETIMEDOUT',
  'ENOTFOUND',
]);

function errorHandler(err, req, res, next) {
  // لو الرد بدأ يتبعت فعلاً، مقدرش أغيّر الحالة - بسيب Express يقفل الاتصال
  if (res.headersSent) return next(err);

  // JSON مكسور جاي من express.json() - من غير الحالة دي Express بيرد صفحة HTML
  // وسط API كل ردوده JSON
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'البيانات المبعوتة مش بصيغة صحيحة' });
  }

  const mapped = DB_ERROR_MAP[err.code];
  if (mapped) {
    console.warn(`[400] ${req.method} ${req.originalUrl} - ${err.code}: ${err.sqlMessage || err.message}`);
    return res.status(mapped.status).json({ error: mapped.message });
  }

  if (DB_DOWN_CODES.has(err.code)) {
    console.error(`[503] ${req.method} ${req.originalUrl} - قاعدة البيانات مش متاحة: ${err.code}`);
    return res.status(503).json({ error: 'الخدمة مش متاحة دلوقتي، جرب تاني بعد شوية' });
  }

  // أي حاجة تانية = عطل حقيقي مش متوقع. بنسجّله كامل عشان نقدر نصلحه،
  // وبنرد رسالة عامة - تفاصيل الخطأ الداخلية عمرها ما تتبعت للمستخدم.
  console.error(`[500] ${req.method} ${req.originalUrl}`, err);
  res.status(500).json({ error: 'حصل خطأ غير متوقع، جرب تاني' });
}

module.exports = { asyncHandler, errorHandler };
