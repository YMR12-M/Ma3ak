# قاعدة البيانات

MySQL، مصدر الحقيقة الوحيد هو [`backend/sql/schema.sql`](../backend/sql/schema.sql) - شغّله كامل على قاعدة فاضية وهيبني كل حاجة. ملفات `migration_2_*.sql` و`migration_3_*.sql` تاريخية بس (لترقية قاعدة اتعملت قبل ما `schema.sql` يتحدّث ويشملهم) - **متشغّلش الـ migrations دي على قاعدة اتعملت بـ schema.sql الحالي**، هتفشل (الأعمدة موجودة بالفعل).

## العلاقات (نظرة سريعة)

```
users (patient) ──┬──< patient_caregiver >──┬── users (caregiver)
                   │
                   ├──< medications ──< doses
                   ├──< appointments
                   ├──< vitals
                   └──< notifications >── users (المستلم عبر user_id)
```

كل جدول (غير `users` نفسه) بيرتبط بـ `users.id` عن طريق `patient_id` مع `ON DELETE CASCADE` - لو مريض اتمسح، كل بياناته بتتمسح معاه تلقائيًا.

## الجداول

### `users`
مريض أو متابع في نفس الجدول (`role` بيفرّق بينهم).

| عمود | النوع | ملاحظات |
|---|---|---|
| `email` | VARCHAR(190) UNIQUE NULL | اختياري - المريض عادة بدون إيميل |
| `password_hash` | VARCHAR(255) NULL | `NULL` للمريض (مبيدخلش بباسورد خالص) |
| `role` | ENUM('patient','caregiver') | |
| `phone` | VARCHAR(30) UNIQUE NULL | معرّف الدخول الأساسي للمتابع |
| `link_code` | VARCHAR(10) UNIQUE NULL | خاص بالمريض - كود قصير لمشاركة متابع تاني |
| `access_token` | VARCHAR(64) UNIQUE NULL | خاص بالمريض - التوكن الطويل في لينك الدخول |

### `patient_caregiver`
جدول ربط many-to-many. `UNIQUE KEY uniq_link (patient_id, caregiver_id)` يمنع تكرار نفس الربط.

### `medications`
| عمود | النوع | ملاحظات |
|---|---|---|
| `times` | JSON | مصفوفة أوقات نصية، مثال: `["08:00","14:00","20:00"]` |
| `active` | TINYINT(1) | `0` = محذوف منطقيًا (soft delete)، بيفضل في السجل |

### `doses`
جرعة واحدة فعلية لموعد معيّن - بتتولّد تلقائيًا من `medications.times` بواسطة `scheduler.js` (يوم قدّام ويومين، كل 5 دقايق).

| عمود | النوع | ملاحظات |
|---|---|---|
| `status` | ENUM('pending','taken','missed') | `missed` بيتحط تلقائيًا بعد 30 دقيقة من الميعاد بدون تسجيل |
| `UNIQUE KEY uniq_dose (medication_id, scheduled_at)` | | بيمنع تكرار توليد نفس الجرعة مرتين (الـ scheduler بيستخدم `INSERT IGNORE`) |

### `appointments`
مواعيد طبية بسيطة - عنوان، دكتور، مكان، وميعاد.

### `vitals`
| عمود | النوع | ملاحظات |
|---|---|---|
| `type` | ENUM('blood_pressure','blood_sugar','weight','heart_rate','temperature') | |
| `value_json` | JSON | شكل حر حسب النوع، مثال: `{"systolic":120,"diastolic":80}` أو `{"value":95,"unit":"mg/dL"}` |

### `notifications`
| عمود | النوع | ملاحظات |
|---|---|---|
| `user_id` | INT | المستلم (مريض أو متابع) |
| `patient_id` | INT | بخصوص أي مريض (حتى لو المستلم متابع) |
| `type` | ENUM('missed_dose','upcoming_appointment','general','patient_issue') | |
| `related_id` | INT NULL | id الجرعة/الموعد المرتبط - بيُستخدم لمنع تكرار نفس التذكير |

## تفاصيل تستاهل انتباه

- **مفيش soft delete على `appointments` و`vitals`** (`DELETE` فعلي)، بعكس `medications` (`active=0`). لو محتاج سجل تاريخي كامل لاحقًا، ده هيحتاج مراجعة.
- **`doses.status` تتغير من الـ scheduler لوحده** (`pending → missed`) من غير أي فعل من المستخدم - لو بتبني عليها منطق تاني، خد بالك إنها مش "قيمة ثابتة" بعد ما تتسجل.
- **صفر Indexes إضافية غير المفاتيح الأساسية/الفريدة** - لقاعدة صغيرة كده مش مشكلة، لكن لو عدد المرضى/الجرعات كبر، `doses.patient_id` و`doses.scheduled_at` أول مرشحين لفهرسة لو الاستعلامات بطّت.
