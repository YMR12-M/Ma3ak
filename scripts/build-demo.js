#!/usr/bin/env node
/* ============================================
   MA3ak (معاك) - بناء النسخة التجريبية (عرض فقط)

   بيجمّع في demo-dist/ نسخة ثابتة بالكامل من الواجهة، من غير أي سيرفر ولا
   قاعدة بيانات: الواجهة الجاهزة (frontend/dist) + باك إند تجريبي بيشتغل جوه
   المتصفح (frontend/demo/demo-api.js). تتستضاف على أي استضافة ملفات ثابتة
   مجانية (Vercel / GitHub Pages / Netlify / Cloudflare Pages).

   التشغيل:  node scripts/build-demo.js [مجلد-الخروج]

   مفيش خطوة بناء للواجهة هنا: frontend/dist متسجّل في git عمدًا (شوف
   frontend/build.js)، فالسكريبت بيكوّبي بس.
   ============================================ */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'demo-dist'));

// اللي الواجهة بتطلبه فعلاً وقت التشغيل. ملفات المصدر (js/ وcss/) والتيستات مش مطلوبة.
const COPY = ['dist', 'fonts', 'icons', 'demo', 'manifest.json', 'sw.js'];

function copyRecursive(from, to) {
  const stat = fs.statSync(from);
  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const name of fs.readdirSync(from)) {
      if (name === '.DS_Store') continue;
      copyRecursive(path.join(from, name), path.join(to, name));
    }
  } else {
    fs.copyFileSync(from, to);
  }
}

if (!fs.existsSync(path.join(FRONTEND, 'dist', 'app.js'))) {
  console.error('❌ frontend/dist/app.js مش موجود - شغّل "npm run build" من مجلد backend الأول.');
  process.exit(1);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const item of COPY) copyRecursive(path.join(FRONTEND, item), path.join(OUT, item));

/* index.html: نفس الملف بالظبط + سكريبت الباك إند التجريبي قبل سكريبتات التطبيق.
   من غير defer عمدًا - لازم يركّب اعتراض fetch قبل ما التطبيق يطلب أي حاجة. */
const marker = '<script defer src="/dist/vendor.js"></script>';
const html = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
if (!html.includes(marker)) {
  console.error('❌ مش لاقي سطر vendor.js في frontend/index.html - الباني محتاج تحديث.');
  process.exit(1);
}
fs.writeFileSync(
  path.join(OUT, 'index.html'),
  html.replace(marker, '<script src="/demo/demo-api.js"></script>\n  ' + marker)
);

/* الـ Service Worker: اسم الكاش بيتغيّر مع كل بناء، عشان زائر رجع بعد نسخة جديدة
   ما يفضلش على هيكل قديم (index.html القديم من غير سكريبت الديمو = تطبيق مكسور). */
const swPath = path.join(OUT, 'sw.js');
const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const sw = fs.readFileSync(swPath, 'utf8');
const cacheLine = /const CACHE_NAME = '[^']+';/;
if (!cacheLine.test(sw)) {
  console.error('❌ مش لاقي CACHE_NAME في sw.js.');
  process.exit(1);
}
fs.writeFileSync(swPath, sw.replace(cacheLine, `const CACHE_NAME = 'ma3ak-demo-${stamp}';`));

/* إعدادات الاستضافة (rewrites + headers) مصدرها vercel.json اللي في جذر الريبو -
   ده الملف اللي Vercel بيقراه فعلاً وقت النشر من git. بننسخ منه للمجلد الناتج
   نسخة من غير مفاتيح البناء، عشان تقدر ترفع demo-dist لوحده على أي استضافة
   بتفهم نفس الصيغة (Vercel CLI / Netlify بعد تحويل بسيط). */
const hosting = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
for (const key of ['$schema', 'framework', 'installCommand', 'buildCommand', 'outputDirectory']) {
  delete hosting[key];
}
fs.writeFileSync(path.join(OUT, 'vercel.json'), JSON.stringify(hosting, null, 2) + '\n');

function count(dir) {
  let n = 0;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    n += fs.statSync(p).isDirectory() ? count(p) : 1;
  }
  return n;
}
console.log(`✅ النسخة التجريبية جاهزة في ${OUT} (${count(OUT)} ملف)`);
