# النشر على Render

المشروع سيرفر Express تقليدي (عملية واحدة فاضلة شغالة طول الوقت، فيها scheduler بيشتغل كل دقيقة) - ده بالظبط اللي Render مبني له، بعكس Vercel (serverless - راجع [ARCHITECTURE.md](ARCHITECTURE.md) لو حابب تفهم الفرق). يعني عمليًا **مفيش أي تعديل كود مطلوب** - بس محتاج تجهّز 3 حاجات مش موجودة في الكود نفسه: حساب Render، قاعدة بيانات خارجية، ومتغيرات البيئة.

## القيد الوحيد المهم: Render مبيوفرش MySQL

Render بيوفّر PostgreSQL وRedis كخدمات مُدارة - **مش MySQL**. المشروع بالكامل مبني على MySQL (`mysql2`, JSON columns, `INSERT IGNORE`, إلخ)، فمحتاج قاعدة بيانات MySQL **خارجية**. الخطوة الأولى قبل أي حاجة.

### خيارات لقاعدة بيانات MySQL خارجية

اتأكد من السعر/الحد المجاني وقت ما تسجّل - العروض بتتغيّر باستمرار:

- **Railway** (railway.app) - MySQL حقيقي كامل (دعم foreign keys بدون قيود)، سهل الإعداد.
- **Aiven** (aiven.io) - MySQL مُدار، فيه تجربة مجانية.
- **Clever Cloud** (clever-cloud.com) - فيه خطة MySQL صغيرة مجانية.

أيًا كان اختيارك، بعد الإنشاء هتاخد منه: **Host, Port, User, Password, Database name**.

### تجهيز الجداول

بعد ما تاخد بيانات الاتصال، اتصل بالقاعدة وشغّل السكيما:

```bash
mysql -h <DB_HOST> -P <DB_PORT> -u <DB_USER> -p <DB_NAME> < backend/sql/schema.sql
```

**لو عندك قاعدة شغالة من قبل نظام الإشعارات الجديد**، شغّل الترقية بدل السكيما الكاملة:

```bash
mysql -h <DB_HOST> -P <DB_PORT> -u <DB_USER> -p <DB_NAME> < backend/sql/migration_4_notifications.sql
mysql -h <DB_HOST> -P <DB_PORT> -u <DB_USER> -p <DB_NAME> < backend/sql/migration_5_gaps.sql
mysql -h <DB_HOST> -P <DB_PORT> -u <DB_USER> -p <DB_NAME> < backend/sql/migration_6_schedule_stock_vitals.sql
```

(بعض المزودين بيدّوك واجهة ويب أو CLI خاصة بيهم للاتصال - اتبع تعليماتهم لو الأمر ده مايشتغلش مباشرة.)

## النشر على Render

### الطريقة الأسهل: Blueprint (render.yaml)

المشروع فيه [`render.yaml`](../render.yaml) جاهز في الجذر:

1. Render Dashboard → **New** → **Blueprint**.
2. اختار الريبو (`YMR12-M/Ma3ak`) والفرع (`main`).
3. Render هيقرأ `render.yaml` لوحده ويجهّز سيرفر باسم `ma3ak`.
4. هيسألك تدخل المتغيرات دي (مش موجودة في الملف عمدًا - أسرار):
   - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` - من قاعدة البيانات اللي جهّزتها فوق.
   - `JWT_SECRET` - Render هيولّده تلقائيًا (`generateValue: true` في الملف)، مش لازم تعمل حاجة.
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` - شوف القسم اللي تحت.
5. **Deploy**.

### مفاتيح الإشعارات (VAPID) - مطلوبة

من غيرها التطبيق بيشتغل، بس **التذكير مش هيوصل لحد والتطبيق مقفول** - يعني الميزة الأساسية معطّلة على الإنتاج.

ولّد الزوج مرة واحدة على جهازك:

```bash
npx web-push generate-vapid-keys
```

وحطهم في **Environment** على Render:

| المتغير | القيمة |
|---|---|
| `VAPID_PUBLIC_KEY` | المفتاح العام من الأمر فوق |
| `VAPID_PRIVATE_KEY` | المفتاح الخاص - **سر، متحطهوش في الريبو** |
| `VAPID_SUBJECT` | `mailto:` بإيميلك (خدمات الدفع بتطلبه في المواصفة) |

> ⚠️ **متغيّرش المفاتيح دي بعد النشر.** كل الاشتراكات القديمة هتبطل وكل مستخدم هيحتاج يفعّل التنبيهات من الأول - وأغلبهم مش هيلاحظ إنها بطّلت أصلاً، هيلاحظ يوم ما تنبيه مهم ميوصلش. لو اضطريت، بلّغ المستخدمين قبلها.

### أو يدويًا (من غير Blueprint)

1. **New** → **Web Service** → اختار الريبو.
2. **Root Directory**: `backend`
3. **Build Command**: `npm install --include=dev && npm run build`
   (الـ `--include=dev` مهم: Render بيبني وNODE_ENV=production، وفي الوضع ده npm بيتخطى
   devDependencies - يعني esbuild أداة بناء الواجهة مكانتش هتتسطّب. لو حصلت مشكلة هنا،
   `npm install && npm start` لوحدهم بيشتغلوا برضه لأن ناتج البناء متسجّل في الريبو.)
4. **Start Command**: `npm start`
5. في **Environment**: ضيف `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET` (قيمة عشوائية طويلة - تقدر تولّدها بـ `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)، و`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`.

`PORT` مش لازم تحطه - Render بيحطه تلقائيًا والسيرفر (`server.js`) بيقراه من `process.env.PORT` أصلاً.

## بعد النشر

- افتح رابط Render اللي هيديهولك (`https://ma3ak-xxxx.onrender.com`) وجرّب تسجّل حساب متابع جديد للتأكد إن الاتصال بقاعدة البيانات شغال.
- حدّث لينك "Live Demo" في [README.md](../README.md) باللينك الجديد.

## ⚠️ قيد مهم: الخطة المجانية (Free Plan)

خطة Render المجانية **بتوقف السيرفر بعد 15 دقيقة من غير طلبات** (spin down)، وبيرجع يشتغل تلقائي أول ما حد يفتح الموقع تاني - بس ده بياخد كام ثانية (cold start)، **ولحد ما حد يفتح الموقع، الـ scheduler (`scheduler.js`) بيبقى واقف تمامًا** - يعني تذكير الجرعات الفايتة ومواعيد الغد مش هيشتغلوا بانتظام لو مفيش حد بيستخدم التطبيق فعليًا في اللحظة دي.

لتطبيق بيعتمد عليه ناس حقيقية في تذكير دوا كبار السن، الخطة المدفوعة (**Starter**) اللي بتخلي السيرفر شغال طول الوقت من غير spin-down هي الأنسب فعليًا - مش رفاهية.

**والقيد ده بقى أهم بكتير مع نظام المنبه.** كل التنبيهات (منبه الجرعة، التذكير، التصعيد) بتتبعت من الـ scheduler على السيرفر - مش من متصفح المستخدم. سيرفر نايم = صفر تنبيهات، مهما كان المستخدم مفعّل كل حاجة عنده.

التصميم بيقلل الضرر قدر الإمكان: كل حالة "اتبعت ولا لأ" متخزّنة في قاعدة البيانات مش في ذاكرة السيرفر، فإعادة التشغيل مبتعيدش إرسال التنبيهات ولا بتضيّعها. وفيه سقف كمان (`DUE_ALARM_MAX_LATE_MINUTES` في `scheduler.js`) بيمنع إن السيرفر لما يصحى بعد ساعتين يبعت دفعة منبهات لجرعات فات وقتها أصلاً. بس ده تخفيف للضرر - **مش بديل عن سيرفر شغال**.
