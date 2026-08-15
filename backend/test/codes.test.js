/* اختبار توليد كود المشاركة ولينك الدخول - لو الصيغة اتغيّرت بالغلط أو حلقة إعادة
   المحاولة عند التصادم اتكسرت، مريض ممكن ياخد كود فاضي أو يتعلق في حلقة لا نهائية. */
const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../db');
const { generateUniqueLinkCode, generateUniqueAccessToken } = require('../utils/codes');

test('generateUniqueLinkCode: 6 حروف/أرقام كابيتال', async (t) => {
  t.mock.method(pool, 'query', async () => [[]]); // مفيش تصادم - أول محاولة تتقبل
  const code = await generateUniqueLinkCode();
  assert.match(code, /^[A-Z0-9]{6}$/);
});

test('generateUniqueAccessToken: 48 حرف hex (24 بايت)', async (t) => {
  t.mock.method(pool, 'query', async () => [[]]);
  const token = await generateUniqueAccessToken();
  assert.match(token, /^[a-f0-9]{48}$/);
});

test('generateUniqueLinkCode: بيعيد المحاولة لو الكود مكرر', async (t) => {
  let calls = 0;
  t.mock.method(pool, 'query', async () => {
    calls += 1;
    return calls === 1 ? [[{ id: 1 }]] /* تصادم في أول مرة */ : [[]] /* فريد تاني مرة */;
  });
  const code = await generateUniqueLinkCode();
  assert.equal(calls, 2); // اتأكدنا إنه فعلاً عاد المحاولة، مقبلش بالتصادم
  assert.match(code, /^[A-Z0-9]{6}$/);
});

test('generateUniqueAccessToken: كل نداء بيرجع قيمة مختلفة (عشوائي حقيقي، مش ثابت)', async (t) => {
  t.mock.method(pool, 'query', async () => [[]]);
  const a = await generateUniqueAccessToken();
  const b = await generateUniqueAccessToken();
  assert.notEqual(a, b);
});
