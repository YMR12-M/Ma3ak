# API Reference

كل الـ endpoints تحت `/api`. الردود كلها JSON. الأخطاء بترجع بالشكل `{ "error": "رسالة بالعربي" }` مع status code مناسب.

## المصادقة

كل الـ endpoints محتاجة هيدر:

```
Authorization: Bearer <JWT>
```

ما عدا `POST /api/auth/register`، `POST /api/auth/login`، و`POST /api/auth/access` (دول اللي بيولّدوا التوكن نفسه). التوكن صالح لمدة **7 أيام** (`expiresIn: '7d'`)، وبيحتوي على `{ id, role, name }` (شوف `middleware/auth.js`). لو التوكن غايب أو غلط بيرجع `401`.

بعض الـ endpoints محدودة بمعدل الطلبات (rate limit) لمنع محاولات التخمين بالجملة. كل عدّاد **منفصل** عن التاني عن قصد - عشان محاولات فاشلة على مسار ما تقفلش مسار تاني مالوش علاقة (زي ما محاولات تسجيل الدخول كانت بتقفل لينك دخول المريض كمان):

| Endpoint | الحد | العدّاد محسوب على |
|---|---|---|
| `POST /auth/login` | 10 كل 15 دقيقة | IP |
| `POST /auth/access` | 20 كل 15 دقيقة | IP |
| `POST /auth/register` | 20 كل ساعة | IP |
| `POST /patients/link` | 10 كل ساعة | حساب المستخدم |

`/patients/link` محسوب على حساب المستخدم مش الـ IP: المهاجم لازم يكون مسجّل دخول أصلاً عشان يستخدمه، وتغيير الـ IP مش هيهرّبه من العدّاد. من غير الحد ده كان ممكن تخمين مئات الأكواد في الثانية (الكود 6 خانات بس).

> **مهم للنشر:** الحدود دي بتعتمد على IP المستخدم الحقيقي، وده بيتوقف على `app.set('trust proxy', 1)` في `server.js`. من غيره كل المستخدمين ورا بروكسي Render بيبانوا كأنهم شخص واحد، وأي 10 محاولات فاشلة بتقفل الدخول على الكل.

## التحقق من المدخلات والأخطاء

كل المدخلات بتتفحص في `utils/validate.js` **قبل** ما توصل لقاعدة البيانات، وبترجع `400` برسالة عربية واضحة:

- **مواعيد الجرعات** (`times`): مصفوفة مش فاضية من `"HH:MM"` بنظام 24 ساعة، من غير تكرار، بحد أقصى 12 ميعاد. (قيمة زي `"25:99"` بتترفض - قبل كده كانت بتتقبل وتتحوّل لجرعة في يوم وساعة غلط.)
- **التواريخ** (`startDate`, `endDate`): `"YYYY-MM-DD"` موجود فعلاً في التقويم (`2026-02-30` بتترفض).
- **التواريخ بالوقت** (`appointmentAt`, `recordedAt`, `from`, `to`): `"YYYY-MM-DD HH:MM[:SS]"` أو صيغة `datetime-local`.
- **أطوال النصوص**: مطابقة لأعمدة `schema.sql` بالظبط (اسم الدواء 150، اسم المستخدم 120، إلخ).
- **قيم القياسات**: لازم تكون أرقام في نطاق منطقي (ضغط، سكر، وزن، نبض، حرارة).

أي خطأ غير متوقع بيتمسك في `middleware/errors.js` ويرجع JSON - **السيرفر عمره ما بيقع بسببه**. قبل الطبقة دي، أي خطأ من قاعدة البيانات جوه دالة `async` كان بينهي العملية كلها ويقفل التطبيق على كل المستخدمين.

| Status | يعني إيه |
|---|---|
| `400` | مدخلات غلط أو ناقصة |
| `401` | توكن غايب أو غير صالح |
| `403` | مفيش صلاحية على المريض ده |
| `404` | العنصر مش موجود |
| `409` | تعارض (مسجل قبل كده / الجرعة اتسجلت قبل كده) |
| `429` | محاولات كتير في وقت قصير |
| `503` | قاعدة البيانات مش متاحة دلوقتي |

## الصلاحيات

أي endpoint بيتعامل مع بيانات مريض معيّن (`patientId`) بيتحقق عن طريق `canAccessPatient(user, patientId)`:
- لو المستخدم **مريض**: لازم `user.id === patientId` (المريض يشوف بياناته هو بس).
- لو المستخدم **متابع**: لازم يكون موجود صف في `patient_caregiver` بيربطه بالمريض ده.

أي مخالفة بترجع `403`.

---

## Auth — `/api/auth`

### `POST /api/auth/register`
تسجيل متابع جديد. الدور دايمًا `caregiver` - المرضى مبيسجلوش بنفسهم.

**Body:** `{ name, phone, password, email? }`
كلمة المرور 6 حروف على الأقل. الموبايل والإيميل (لو موجود) لازم يكونوا فريدين.

**Response `201`:** `{ token, user: { id, name, email, role, phone } }`
**أخطاء:** `400` بيانات ناقصة/باسورد قصير، `409` الموبايل أو الإيميل مسجل قبل كده.

### `POST /api/auth/login`
تسجيل دخول متابع بموبايل أو إيميل.

**Body:** `{ identifier, password }` — `identifier` ممكن يكون موبايل أو إيميل.
**Response `200`:** `{ token, user }`
**أخطاء:** `401` بيانات غلط (رسالة عامة - ما بتفرقش بين "المستخدم مش موجود" و"الباسورد غلط" لمنع تسريب معلومة).

الرد كمان بياخد **نفس الوقت تقريبًا** في الحالتين: لما المستخدم مش موجود بنقارن بهاش وهمي بدل ما نرجع فورًا. من غير كده فرق التوقيت لوحده كان بيقول للمهاجم إن الرقم ده مسجّل عندنا، حتى من غير ما يعرف كلمة المرور.

### `POST /api/auth/access` <a id="access-token"></a>
دخول المريض بلينك الدخول (بدون باسورد). ده اللي بيحصل تلقائيًا لما حد يفتح `/access/<token>`.

**Body:** `{ token }` — الـ `access_token` اللي المتابع رجعهولوله.
**Response `200`:** `{ token, user }` (توكن JWT جديد، مختلف عن الـ access_token)
**أخطاء:** `404` اللينك مش شغال (اتلغى أو غلط).

### `GET /api/auth/me`
بيانات المستخدم الحالي حسب التوكن.

**Response `200`:** `{ user: { id, name, email, role, phone } }`

---

## Patients — `/api/patients`

### `POST /api/patients`
المتابع بيضيف مريض جديد. **متابعين بس.**

**Body:** `{ name, phone? }`
بيولّد `link_code` (6 حروف، لمشاركة متابع تاني) و`access_token` (طويل، للينك الدخول) تلقائيًا، وبيربط المريض بالمتابع الحالي.

**Response `201`:** `{ patient: { id, name, phone, link_code, access_token } }`

### `POST /api/patients/link`
متابع تاني بينضم لمتابعة مريض موجود عن طريق `link_code`. **متابعين بس.**

**Body:** `{ code }`
**Response `201`:** `{ patient: { id, name, phone } }`
**أخطاء:** `404` كود غلط، `409` انت متابع للمريض ده بالفعل.

### `POST /api/patients/:id/report-issue`
المريض (أو متابع) بيبلّغ عن مشكلة بضغطة واحدة. بيبعت إشعار (`type: 'patient_issue'`) لكل متابعي المريض فورًا.

**Body:** `{ issueType, medicationName? }`
`issueType` واحدة من: `med_finished`, `forgot_dose`, `side_effect`, `unclear_dose`, `want_call`, `other`.
**Response `201`:** `{ ok: true, notified: <عدد المتابعين اللي اتبعتلهم إشعار> }`

### `POST /api/patients/:id/regenerate-link`
توليد `access_token` جديد للمريض (يلغي القديم فورًا - مفيد لو اللينك اتسرب).

**Response `200`:** `{ access_token }`

### `GET /api/patients/:id/caregivers`
قايمة المتابعين لمريض معيّن. بتستخدمها شاشة المريض لعرض كارت "متابعك".

**Response `200`:** `{ caregivers: [{ id, name }] }`

### `GET /api/patients`
لو المستخدم مريض: بيانات نفسه بس. لو متابع: كل المرضى المرتبطين بيه.

**Response `200`:** `{ patients: [...] }` (المتابع بياخد كمان `link_code` و`access_token` لكل مريض)

---

## Medications — `/api/medications`

### `GET /api/medications?patientId=`
الأدوية النشطة (`active = 1`) لمريض معيّن.

### `GET /api/medications/:patientId/today`
جرعات اليوم بس (`DATE(scheduled_at) = CURDATE()`) مع اسم وجرعة الدواء - دي اللي بتغذي شاشة المريض الرئيسية.

### `POST /api/medications`
إضافة دواء جديد. بيولّد جرعات اليوم وبكرة فورًا (بدون ما يستنى دورة الـ scheduler).

**Body:** `{ patientId, name, dosage?, notes?, times: ["08:00","20:00"], startDate, endDate? }`

### `PUT /api/medications/:id`
تعديل دواء (كل الحقول اختيارية - أي حقل مش مبعوت بيفضل زي ما هو). لو `active` اتسيبت `true`، بيعيد توليد الجرعات (مفيد لو الأوقات اتغيرت).

### `DELETE /api/medications/:id`
**Soft delete** - بيحط `active = 0`، مش بيمسح الصف. الجرعات القديمة المرتبطة بيه بتفضل موجودة في السجل.

---

## Doses — `/api/doses`

### `POST /api/doses/:id/take`
تسجيل إن الجرعة اتاخدت. بيرفض لو الجرعة مش `pending`، أو لو لسه بدري (قبل الميعاد بـ **15 دقيقة** - نفس الرقم المستخدم في الفرونت إند `PatientHome.jsx` لفتح الزرار، لازم يفضلوا متطابقين).

**Response `200`:** `{ ok: true }`
**أخطاء:** `409` مسجّلة قبل كده، `403` لسه بدري.

### `GET /api/doses?patientId=&from=&to=`
سجل الجرعات لمريض (لآخر 200 صف)، مع فلترة اختيارية بفترة زمنية.

---

## Appointments — `/api/appointments`

CRUD كامل، كلها بتتحقق من `canAccessPatient` أولاً:

| Method | Path | Body |
|---|---|---|
| `GET` | `/api/appointments?patientId=` | - |
| `POST` | `/api/appointments` | `{ patientId, title, appointmentAt, doctorName?, location?, notes? }` |
| `PUT` | `/api/appointments/:id` | أي حقل من اللي فوق (اختياري) |
| `DELETE` | `/api/appointments/:id` | - (حذف فعلي، مش soft delete) |

---

## Vitals — `/api/vitals`

القياسات الصحية: `blood_pressure`, `blood_sugar`, `weight`, `heart_rate`, `temperature`.

| Method | Path | Body |
|---|---|---|
| `GET` | `/api/vitals?patientId=&type=` | - (آخر 100 قياس، فلترة اختيارية بالنوع) |
| `POST` | `/api/vitals` | `{ patientId, type, value, recordedAt? }` — `value` أوبجكت حر بيتخزن JSON (مثلاً `{systolic:120,diastolic:80}`) |
| `DELETE` | `/api/vitals/:id` | - |

---

## Notifications — `/api/notifications`

| Method | Path | ملاحظات |
|---|---|---|
| `GET` | `/api/notifications` | آخر 50 إشعار للمستخدم الحالي |
| `POST` | `/api/notifications/:id/read` | يعلّم إشعار واحد كمقروء |
| `POST` | `/api/notifications/read-all` | يعلّم كل الإشعارات كمقروءة |

الإشعارات بتتولد تلقائيًا من `scheduler.js` (جرعة فايتة، موعد قرب) أو من `patients.js` (بلاغ مشكلة من المريض) - مفيش endpoint لإنشاء إشعار يدوي.
