require('dotenv').config();
const path = require('path');
const express = require('express');

// من غير JWT_SECRET حقيقي وطويل، أي توكن ممكن يتزور. نوقف السيرفر بدل ما يشتغل بمفتاح ضعيف من غير ما نحس.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error(
    '❌ JWT_SECRET مش موجود في .env أو قصير جدًا. حط قيمة عشوائية طويلة (16 حرف على الأقل) وشغّل تاني.\n' +
      '   تقدر تولّد واحدة بالأمر: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
  );
  process.exit(1);
}

const authRoutes = require('./routes/auth');
const patientsRoutes = require('./routes/patients');
const medicationsRoutes = require('./routes/medications');
const dosesRoutes = require('./routes/doses');
const appointmentsRoutes = require('./routes/appointments');
const vitalsRoutes = require('./routes/vitals');
const notificationsRoutes = require('./routes/notifications');
const { startScheduler } = require('./scheduler');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

app.use('/api/auth', authRoutes);
app.use('/api/patients', patientsRoutes);
app.use('/api/medications', medicationsRoutes);
app.use('/api/doses', dosesRoutes);
app.use('/api/appointments', appointmentsRoutes);
app.use('/api/vitals', vitalsRoutes);
app.use('/api/notifications', notificationsRoutes);

// أي مسار API مش موجود
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'المسار غير موجود' });
});

// أي طلب تاني (SPA): يرجع index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// بيتصدّر عشان التيستات تقدر تشغّله على بورت عشوائي (http.createServer(app).listen(0))
// من غير ما تستدعي app.listen ولا الـ scheduler فعليًا. لما الملف يتشغّل مباشرة (node server.js)
// require.main بيبقى هو نفسه، فالسيرفر بيشتغل عادي زي أي وقت.
module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🤝 MA3ak server running on http://localhost:${PORT}`);
    startScheduler();
  });
}
