const crypto = require('crypto');
const pool = require('../db');

// كود قصير (6 حروف) بيتقال بصوت عالي أو يتكتب بسهولة - لمشاركة متابع تاني
function generateShortCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

// توكن طويل وعشوائي - بيتحط جوه "لينك الدخول" بتاع المريض، وهو بديل الباسورد بالكامل
function generateAccessToken() {
  return crypto.randomBytes(24).toString('hex');
}

async function generateUniqueLinkCode() {
  let code, unique;
  do {
    code = generateShortCode();
    const [dup] = await pool.query('SELECT id FROM users WHERE link_code = ?', [code]);
    unique = dup.length === 0;
  } while (!unique);
  return code;
}

async function generateUniqueAccessToken() {
  let token, unique;
  do {
    token = generateAccessToken();
    const [dup] = await pool.query('SELECT id FROM users WHERE access_token = ?', [token]);
    unique = dup.length === 0;
  } while (!unique);
  return token;
}

module.exports = { generateUniqueLinkCode, generateUniqueAccessToken };
