/* اختبار تنسيق الوقت في رسايل الإشعارات. الرسايل دي بتتخزن في قاعدة البيانات
   وبيقراها كبار السن على شاشتهم، فـ"2026-08-16 20:00:00" وسط جملة عربية مش
   مقبول - وكمان الإشعار كان بيقول "غدًا" لأي موعد حتى لو بعد ساعتين النهاردة.

   كل الاختبارات هنا مستقلة عن توقيت الجهاز: الدوال دي بتقرا ساعة الحائط من
   النص زي ما هي (القيمة أصلاً متخزنة بتوقيت مصر)، من غير أي تحويل مناطق زمنية. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { formatCairoClock, describeCairoWhen, cairoToday, cairoDateWithOffset } = require('../utils/time');

test('formatCairoClock: بيحول لصيغة 12 ساعة بالعربي', () => {
  assert.equal(formatCairoClock('2026-08-16 20:00:00'), '8:00 م');
  assert.equal(formatCairoClock('2026-08-16 08:30:00'), '8:30 ص');
  assert.equal(formatCairoClock('2026-08-16 00:15:00'), '12:15 ص'); // منتصف الليل مش "0:15"
  assert.equal(formatCairoClock('2026-08-16 12:00:00'), '12:00 م'); // الظهر مش "0:00 م"
  assert.equal(formatCairoClock('2026-08-16 13:05:00'), '1:05 م');
});

test('describeCairoWhen: بيفرّق بين النهاردة وبكرة وأي يوم تاني', () => {
  const today = cairoToday();
  const tomorrow = cairoDateWithOffset(1, '00:00').slice(0, 10);

  assert.equal(describeCairoWhen(`${today} 20:00:00`), 'النهاردة الساعة 8:00 م');
  assert.equal(describeCairoWhen(`${tomorrow} 10:00:00`), 'بكرة الساعة 10:00 ص');

  // تاريخ بعيد لازم يتقال صريح، مش "بكرة"
  const far = describeCairoWhen('2030-01-01 09:00:00');
  assert.match(far, /^يوم 2030-01-01 الساعة 9:00 ص$/);
});
