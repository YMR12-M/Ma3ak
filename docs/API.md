# API Reference

كل الـ endpoints تحت `/api`. الردود كلها JSON. الأخطاء بترجع بالشكل `{ "error": "رسالة بالعربي" }` مع status code مناسب.

## المصادقة

كل الـ endpoints محتاجة هيدر:

```
Authorization: Bearer <JWT>
```

ما عدا `POST /api/auth/register`، `POST /api/auth/login`، و`POST /api/auth/access` (دول اللي بيولّدوا التوكن نفسه). التوكن صالح لمدة **7 أيام** (`expiresIn: '7d'`)، وبيحتوي على `{ id, role, name }` (شوف `middleware/auth.js`). لو التوكن غايب أو غلط بيرجع `401`.

بعض الـ endpoints محدودة بمعدل الطلبات (rate limit) لمنع محاولات التخمين بالجملة:
- `/auth/login` و`/auth/access`: 10 محاولات كل 15 دقيقة لكل IP.
- `/auth/register`: 20 محاولة كل ساعة لكل IP.

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
