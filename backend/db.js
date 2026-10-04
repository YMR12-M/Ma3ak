require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'ma3ak',
  // TLS مع الخدمات المُدارة (Aiven وأمثالها). مقفول افتراضيًا، فالتشغيل المحلي ما بيتأثرش.
  // لو شهادة الخدمة مش من جهة معروفة: NODE_EXTRA_CA_CERTS=/path/to/ca.pem
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
});

module.exports = pool;
