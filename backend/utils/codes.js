const crypto = require('crypto');
const pool = require('../db');

/* حروف الكود القصير: من غير الحروف والأرقام اللي بتتلخبط مع بعض وقت القراءة
   بصوت عالي أو الكتابة (0 و O، 1 و I و L) - الكود ده بيتقال في التليفون لحد
   كبير في السن، فأي لبس فيه معناه محاولة فاشلة ومكالمة تانية. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 31 حرف
const CODE_LENGTH = 6;

// أقصى عدد محاولات لتوليد قيمة فريدة - حماية من حلقة لا نهائية لو حصل خطأ غير متوقع
const MAX_ATTEMPTS = 20;

/* كود قصير (6 حروف) بيتقال بصوت عالي أو يتكتب بسهولة - لمشاركة متابع تاني.
   بنستخدم crypto مش Math.random لسببين: الأول إن Math.random عشوائيتها متوقعة
   (مش مصممة للأمان)، والكود ده بيدي وصول كامل لبيانات مريض طبية. والتاني إن
   Math.random().toString(36).slice(2, 8) القديمة كانت ممكن ترجع أقل من 6 حروف
   لما الرقم العشوائي يطلع قصير - يعني كود أضعف من غير ما حد ياخد باله. */
function generateShortCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    // randomInt أدق من % (بيتجنب الانحياز)، بس randomBytes + randomInt هنا كفاية
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

/* كود استرجاع كلمة المرور - أطول بكتير من كود المشاركة (4 مجموعات × 4 حروف)
   لأن ده بديل كامل للباسورد، مش مجرد دعوة. بيتقسّم بشرطات عشان المستخدم يقدر
   ينسخه أو يكتبه من غير غلط.

   نفس الأبجدية بتاعت كود المشاركة (من غير الحروف اللي بتتلخبط)، بس بمساحة
   أكبر بكتير: 31^16 ≈ 10^23 احتمال - مستحيل يتخمّن حتى من غير حد المحاولات.
   وبرغم كده المسار محمي بـ loginLimiter برضه، لأن الحماية بطبقة واحدة مش حماية. */
const RECOVERY_GROUPS = 4;
const RECOVERY_GROUP_LENGTH = 4;

function generateRecoveryCode() {
  const groups = [];
  for (let g = 0; g < RECOVERY_GROUPS; g += 1) {
    let group = '';
    for (let i = 0; i < RECOVERY_GROUP_LENGTH; i += 1) {
      group += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    }
    groups.push(group);
  }
  return groups.join('-');
}

// توكن طويل وعشوائي - بيتحط جوه "لينك الدخول" بتاع المريض، وهو بديل الباسورد بالكامل
function generateAccessToken() {
  return crypto.randomBytes(24).toString('hex');
}

// بيعيد المحاولة لو القيمة اتصادفت مع واحدة موجودة، بحد أقصى معقول
async function generateUnique(generate, column) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const value = generate();
    const [dup] = await pool.query(`SELECT id FROM users WHERE ${column} = ?`, [value]);
    if (dup.length === 0) return value;
  }
  throw new Error(`تعذر توليد قيمة فريدة للعمود ${column} بعد ${MAX_ATTEMPTS} محاولة`);
}

async function generateUniqueLinkCode() {
  return generateUnique(generateShortCode, 'link_code');
}

async function generateUniqueAccessToken() {
  return generateUnique(generateAccessToken, 'access_token');
}

module.exports = {
  generateUniqueLinkCode,
  generateUniqueAccessToken,
  generateRecoveryCode,
  CODE_ALPHABET,
  CODE_LENGTH,
};
