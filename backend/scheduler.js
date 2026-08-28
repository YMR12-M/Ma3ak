/* ============================================
   MA3ak (معاك) - المهام الدورية: توليد الجرعات، المنبه، والتصعيد

   ---------- خط زمني الجرعة الواحدة ----------
   الجرعة مش "إشعار بيتبعت مرة"، دي **حالة بتتصعّد** لو محدش تفاعل معاها:

     الميعاد        → منبه للمريض  (dose_due)      + زرار "خدته" و"غفوة" جوه الإشعار
     +10 د (غفوة)   → المنبه يرن تاني               (بحد أقصى 3 غفوات)
     +15 د          → تذكير تاني أقوى (dose_reminder)
     +30 د          → الجرعة "فاتت" + تنبيه للمتابع (missed_dose)
     +45 د          → تصعيد للمتابع (dose_escalation، أولوية حرجة دايمًا)

   المريض بياخد التنبيهات الأولانية لوحده - المتابع مبيتزعجش غير لما يبقى فيه
   حاجة تستاهل فعلاً. ده مقصود: متابع بيترن عليه في كل جرعة هيقفل الإشعارات
   خلال يومين، وساعتها التنبيه المهم مش هيوصله.

   ---------- ليه كل دقيقة مش كل 5 دقايق ----------
   قبل كده الدورة كانت كل 5 دقايق، فأي تنبيه كان ممكن يتأخر لحد 5 دقايق. على
   منبه دوا ده فرق محسوس (المريض بيبص على الساعة ويلاقي التطبيق ساكت). الدورة
   دلوقتي كل دقيقة، والاستعلامات كلها ماشية على فهارس (idx_status_scheduled).

   ---------- ليه الحالة في قاعدة البيانات مش في الذاكرة ----------
   كل "اتبعت ولا لأ" متسجّل في أعمدة (due_notified_at، reminder_notified_at،
   escalated_at) مش في Set جوه الذاكرة. السبب عملي: Render بينيّم الخدمة
   المجانية وبيعيد تشغيلها، وأي حالة في الذاكرة بتضيع - يعني المريض كان ممكن
   ياخد نفس التنبيه تاني، أو ما ياخدوش خالص.
   ============================================ */

const pool = require('./db');
const {
  cairoToday,
  cairoDateWithOffset,
  cairoNowString,
  cairoNowPlusMinutes,
  formatCairoClock,
  describeCairoWhen,
  isDayEnabled,
} = require('./utils/time');
const { createNotification, notifyUsers, getCaregiverIds } = require('./utils/notify');
const { signDoseAction } = require('./utils/actionToken');

const RUN_INTERVAL_MS = 60 * 1000; // كل دقيقة

// بعد ما ميعاد الجرعة يعدي بالمدة دي من غير تسجيل → تذكير تاني أقوى
const REMINDER_MINUTES = 15;
// وبعد المدة دي من الميعاد → الجرعة تتحسب "فايتة" ويتبعت للمتابع
const GRACE_MINUTES = 30;
// وبعد المدة دي **من لحظة اعتبارها فايتة** → تصعيد حرج للمتابع
const ESCALATE_AFTER_MISSED_MINUTES = 15;

/* أقصى تأخير مسموح بيه لإرسال منبه "وصل الميعاد".
   من غير السقف ده، لو السيرفر كان نايم ساعتين وقام، كان هيبعت منبه لكل جرعة
   عدى ميعادها في الساعتين دول مرة واحدة - دفعة تنبيهات مفزعة لجرعات فات وقتها
   أصلاً. الجرعات دي مكانها مسار "فاتت" مش مسار "المنبه". */
const DUE_ALARM_MAX_LATE_MINUTES = GRACE_MINUTES;

/* ونفس المبدأ لمسار "فاتت" - وده كان ناقص.
   المنبه كان له سقف تأخير، لكن "فاتت" والتصعيد مكانش لهم أي سقف من ناحية
   الماضي، فأول ما السيرفر يقوم من النوم (خطة Render المجانية بتنيّمه بعد 15
   دقيقة) كان بيلمّ كل اللي فات ويبعته دفعة واحدة - 6 إشعارات "جرعة فاتت" في
   نفس الدقيقة على متابع واحد.

   وده بالظبط اللي utils/notify.js مكتوب عشان يمنعه: "متابع بيترن عليه في كل
   جرعة هيقفل الإشعارات خلال يومين، وساعتها التنبيه المهم مش هيوصله".

   الجرعات الأقدم من كده بتتعلّم "فايتة" في قاعدة البيانات عادي (الحالة لازم
   تفضل صح، والتقرير بيقرا منها) بس بإشعار **واحد مجمّع** بدل واحد لكل جرعة. */
const MISSED_NOTIFY_MAX_LATE_MINUTES = 120;

const SNOOZE_MINUTES = 10;
const MAX_SNOOZES = 3;

/* "الميعاد الفعلي" للجرعة = ميعاد الغفوة لو المريض أجّلها، وإلا ميعادها الأصلي.
   كل مراحل المنبه (تذكير/فاتت/تصعيد) بتتحسب من ده مش من scheduled_at لوحده،
   عشان الغفوة تمدّ فترة السماح فعليًا بدل ما ترنّ وتتحسب "فاتت" في نفس الدقيقة. */
const EFFECTIVE_AT = 'COALESCE(d.snooze_until, d.scheduled_at)';

/* بصمة قصيرة وثابتة لمجموعة ids - بتتحط في dedupe_key بدل ما نحشر كل الأرقام
   في عمود طوله 120 حرف ونقصّها. مش تشفير: الغرض هوية مستقرة للمجموعة. */
function hashIds(ids) {
  return require('crypto')
    .createHash('sha1')
    .update([...ids].sort((a, b) => a - b).join(','))
    .digest('hex')
    .slice(0, 16);
}

// ---------------------------------------------------------------------------
// توليد صفوف الجرعات
// ---------------------------------------------------------------------------

// بيولّد صفوف الجرعات المتوقعة (اليوم وبكرة) لدواء واحد بعينه.
// كل الحسابات هنا بتوقيت مصر (utils/time.js) - مش توقيت السيرفر اللي الكود
// شغال عليه فعليًا (Render/Railway غالبًا UTC) - عشان "اليوم" و"الميعاد" يبقوا
// مطابقين لساعة المستخدم الحقيقية.
async function generateDosesForMedication(med) {
  const times = typeof med.times === 'string' ? JSON.parse(med.times) : med.times;

  for (const daysOffset of [0, 1]) {
    for (const t of times) {
      const scheduled = cairoDateWithOffset(daysOffset, t);
      if (scheduled < `${med.start_date} 00:00:00`) continue;
      if (med.end_date && scheduled > `${med.end_date} 23:59:59`) continue;
      /* دواء أسبوعي أو بأيام محددة: مبنولّدش جرعة في يوم مش مفعّل.
         قبل العمود ده كان كل دواء في التطبيق يومي بالضرورة، فالأدوية الأسبوعية
         (أليندرونات، ميثوتريكسات، حقن ب12) كانت يا تتسجّل يومي - فالمريض
         يترنّ عليه كل يوم وتتحسب فايتة 6 مرات في الأسبوع - يا متتسجّلش أصلاً. */
      if (!isDayEnabled(med.days_of_week, scheduled)) continue;

      try {
        await pool.query(
          `INSERT IGNORE INTO doses (medication_id, patient_id, scheduled_at, status)
           VALUES (?, ?, ?, 'pending')`,
          [med.id, med.patient_id, scheduled]
        );
      } catch (e) {
        console.error('scheduler: generateDosesForMedication insert error:', e.message);
      }
    }
  }
}

/* بيشيل صفوف الجرعات اللي مبقاش ليها معنى بعد تعديل الدواء أو إيقافه.

   من غير الدالة دي: المتابع يوقف الدوا (الراوت بيعمل active = 0) أو يغيّر
   ميعاده من 8 لـ 9، والصفوف القديمة بتفضل pending في الجدول - فالمنبه بيرنّ
   على المريض لدوا الدكتور وقّفه، والمتابع بياخد "جرعة فاتت" لدوا مش موجود.
   وده أخطر شكل للخطأ ده: كبير السن بياخد دوا موقوف لأن التطبيق قاله. */
async function cleanupStaleDoses(med) {
  const now = cairoNowString();

  // الدواء اتوقف بالكامل: كل جرعاته الجاية تتشال
  if (!med.active) {
    await pool.query(
      `DELETE FROM doses WHERE medication_id = ? AND status = 'pending' AND scheduled_at > ?`,
      [med.id, now]
    );
    return;
  }

  const times = typeof med.times === 'string' ? JSON.parse(med.times) : med.times;
  const keep = Array.isArray(times) && times.length ? times : ['__none__'];

  /* الجرعات الجاية اللي ساعتها مبقتش في قايمة المواعيد. بنقارن بـ TIME() مش
     بالنص الكامل عشان القارنة تبقى على الساعة بس مهما كان اليوم.
     ومبنمسّش اللي فات ميعادها: دي بقت تاريخ فعلي (اتاخدت أو فاتت) وتقرير
     الالتزام بيقرا منها - مسحها بيزوّر التاريخ. */
  await pool.query(
    `DELETE FROM doses
      WHERE medication_id = ? AND status = 'pending' AND scheduled_at > ?
        AND TIME(scheduled_at) NOT IN (${keep.map(() => '?').join(',')})`,
    [med.id, now, ...keep.map((t) => `${t}:00`)]
  );

  // وأيام الأسبوع اللي اتقفلت (دواء بقى أسبوعي بعد ما كان يومي)
  const [rows] = await pool.query(
    `SELECT id, scheduled_at FROM doses
      WHERE medication_id = ? AND status = 'pending' AND scheduled_at > ?`,
    [med.id, now]
  );
  const drop = rows.filter((r) => !isDayEnabled(med.days_of_week, r.scheduled_at)).map((r) => r.id);
  if (drop.length) {
    await pool.query(`DELETE FROM doses WHERE id IN (${drop.map(() => '?').join(',')})`, drop);
  }
}

// بيولّد صفوف الجرعات المتوقعة (اليوم وبكرة) لكل الأدوية النشطة
async function generateDoses() {
  const [meds] = await pool.query(
    `SELECT * FROM medications WHERE active = 1 AND (end_date IS NULL OR end_date >= ?)`,
    [cairoToday()]
  );
  for (const med of meds) {
    await generateDosesForMedication(med);
  }
}

// ---------------------------------------------------------------------------
// المنبه: أزرار الفعل جوه الإشعار
// ---------------------------------------------------------------------------

/* الأزرار اللي بتظهر جوه إشعار الجرعة نفسه. دي مش تفصيلة شكلية - دي الفرق بين
   ميزة بتتستخدم وميزة بتتجاهل: كبير سن مش هيفتح التطبيق ويدوّر على الجرعة عشان
   يقول "خدتها". الضغطة لازم تكون في نفس المكان اللي شاف فيه التنبيه.

   الغفوة بتتشال لو الدواء "حرج" (أنسولين، أدوية قلب) أو لو المتابع قافلها
   للدواء ده - الغفوة سلاح ذو حدين طبيًا، فمش كل دواء يستحملها. */
// dose هنا صف الجرعة وقد اتعمله JOIN مع الدواء، فأعمدة الاتنين موجودة عليه
function buildDoseActions(dose) {
  const actions = [{ action: 'take', title: 'خدته ✓' }];
  const snoozeAllowed = dose.snooze_allowed && !dose.is_critical && dose.snooze_count < MAX_SNOOZES;
  if (snoozeAllowed) {
    actions.push({ action: 'snooze', title: `فكّرني بعد ${SNOOZE_MINUTES} د` });
  }
  return actions;
}

function doseNotificationData(dose) {
  return {
    doseId: dose.id,
    medName: dose.name,
    dosage: dose.dosage || null,
    // تعليمات الدكتور ("خده بعد الأكل") - أهم من الجرعة نفسها أحيانًا،
    // ومقصوصة عشان جسم الإشعار له حد عملي قبل ما المتصفح يقصّه هو
    notes: dose.notes ? String(dose.notes).slice(0, 120) : null,
    snoozeMinutes: SNOOZE_MINUTES,
    // التوكن ده بيخلي زرار "خدته" يشتغل من جوه الـ Service Worker، اللي مش
    // بيقدر يقرا توكن الدخول من localStorage. تفاصيله في utils/actionToken.js
    actionToken: signDoseAction(dose.patient_id, dose.id),
  };
}

// ---------------------------------------------------------------------------
// 1) وصل ميعاد الجرعة (أو خلصت الغفوة) → منبه للمريض
// ---------------------------------------------------------------------------

async function notifyDueDoses() {
  const now = cairoNowString();
  const [rows] = await pool.query(
    `SELECT d.*, m.name, m.dosage, m.notes, m.is_critical, m.snooze_allowed
       FROM doses d
       JOIN medications m ON m.id = d.medication_id
      WHERE d.status = 'pending'
        -- الدواء الموقوف مبيرنّش. من غير الشرط ده كان المريض بياخد منبه لدوا
        -- الدكتور وقّفه، لأن إيقاف الدواء بيعمل active = 0 وبس.
        AND m.active = 1
        AND (
              -- المنبه الأول: وصل الميعاد ولسه مرنّش
              (d.due_notified_at IS NULL AND d.scheduled_at <= ? AND d.scheduled_at >= ?)
              -- أو: غفوة خلصت ولازم يرن تاني (بنفس سقف التأخير: غفوة عدى
              -- عليها ساعتين والسيرفر كان نايم مالهاش لازمة ترن دلوقتي).
              -- snooze_notified_at هو اللي بيمنع تكرار رنّة نفس الغفوة - قبل
              -- كده كنا بنصفّي snooze_until بعد الرنّة، وده كان بيضيّع "الميعاد
              -- الفعلي" فالجرعة تتحسب فايتة في نفس اللحظة اللي بترنّ فيها.
              OR (
                   d.snooze_until IS NOT NULL AND d.snooze_until <= ? AND d.snooze_until >= ?
                   AND (d.snooze_notified_at IS NULL OR d.snooze_notified_at < d.snooze_until)
                 )
            )`,
    [
      now,
      cairoNowPlusMinutes(-DUE_ALARM_MAX_LATE_MINUTES),
      now,
      cairoNowPlusMinutes(-DUE_ALARM_MAX_LATE_MINUTES),
    ]
  );

  for (const dose of rows) {
    const isSnoozeRing = Boolean(dose.snooze_until);
    const priority = dose.is_critical ? 'critical' : 'normal';

    await createNotification({
      userId: dose.patient_id,
      patientId: dose.patient_id,
      type: 'dose_due',
      priority,
      relatedId: dose.id,
      // رقم الغفوة جزء من المفتاح: كل رنة غفوة إشعار مستقل، مش تكرار للأول
      dedupeKey: `due-${dose.id}-${dose.snooze_count}`,
      message: `وقت دوا "${dose.name}" الساعة ${formatCairoClock(dose.scheduled_at)}`,
      push: {
        title: isSnoozeRing ? 'فكّرناك: وقت الدوا 💊' : 'وقت الدوا 💊',
        body:
          `${dose.name}${dose.dosage ? ` - ${dose.dosage}` : ''}` +
          (dose.notes ? `\n${String(dose.notes).slice(0, 120)}` : ''),
        // نفس الوسم لكل رنّات نفس الجرعة: الرنة الجديدة بتحل محل القديمة في
        // شريط الإشعارات بدل ما تتكدّس فوقها
        tag: `dose-${dose.id}`,
        url: '/',
        actions: buildDoseActions(dose),
        data: doseNotificationData(dose),
        // بعد فترة السماح الإشعار ده مبقاش له معنى - مسار "فاتت" هو اللي بيشتغل
        ttl: GRACE_MINUTES * 60,
      },
    });

    /* snooze_until **مبيتصفّاش** هنا. هو "الميعاد الفعلي" اللي مراحل المنبه
       اللي بعدها بتتحسب منه، ولو صفّيناه الجرعة بترجع تتقاس من ميعادها الأصلي
       اللي عدّى خلاص - فتتحسب فايتة في نفس الدورة اللي رنّت فيها. */
    await pool.query(
      `UPDATE doses
          SET due_notified_at = COALESCE(due_notified_at, ?), snooze_notified_at = ?
        WHERE id = ?`,
      [now, now, dose.id]
    );
  }
}

// ---------------------------------------------------------------------------
// 2) عدى وقت ولسه محدش سجّل → تذكير تاني أقوى
// ---------------------------------------------------------------------------

async function notifyDoseReminders() {
  const now = cairoNowString();
  const [rows] = await pool.query(
    `SELECT d.*, m.name, m.dosage, m.notes, m.is_critical, m.snooze_allowed
       FROM doses d
       JOIN medications m ON m.id = d.medication_id
      WHERE d.status = 'pending'
        AND m.active = 1
        AND d.due_notified_at IS NOT NULL
        AND d.reminder_notified_at IS NULL
        -- بيتقاس من "الميعاد الفعلي": المريض اللي أجّل لسه مستنيه يعدّي عليه
        -- ربع ساعة **من ميعاد الغفوة**، مش من الميعاد الأصلي اللي عدّى خلاص
        AND ${EFFECTIVE_AT} <= ?`,
    [cairoNowPlusMinutes(-REMINDER_MINUTES)]
  );

  for (const dose of rows) {
    await createNotification({
      userId: dose.patient_id,
      patientId: dose.patient_id,
      type: 'dose_reminder',
      priority: dose.is_critical ? 'critical' : 'normal',
      relatedId: dose.id,
      dedupeKey: `reminder-${dose.id}`,
      message: `لسه مسجلتش دوا "${dose.name}" بتاع الساعة ${formatCairoClock(dose.scheduled_at)}`,
      push: {
        title: 'لسه مخدتش الدوا؟',
        body: `${dose.name} - كان الساعة ${formatCairoClock(dose.scheduled_at)}`,
        tag: `dose-${dose.id}`,
        url: '/',
        actions: buildDoseActions(dose),
        data: doseNotificationData(dose),
        ttl: (GRACE_MINUTES - REMINDER_MINUTES) * 60,
      },
    });

    await pool.query('UPDATE doses SET reminder_notified_at = ? WHERE id = ?', [now, dose.id]);
  }
}

// ---------------------------------------------------------------------------
// 3) فترة السماح خلصت → الجرعة "فاتت" + تنبيه المتابع
// ---------------------------------------------------------------------------

async function markMissedAndNotify() {
  const [rows] = await pool.query(
    `SELECT d.*, m.name, m.is_critical, ${EFFECTIVE_AT} AS effective_at
       FROM doses d
       JOIN medications m ON m.id = d.medication_id
      WHERE d.status = 'pending'
        -- الدواء الموقوف مبيولّدش "جرعة فاتت" - المتابع مبيتنبّهش على دوا هو
        -- نفسه وقّفه
        AND m.active = 1
        /* الميعاد الفعلي (ميعاد الغفوة لو فيه) هو اللي فترة السماح بتتقاس منه.
           الجرعة اللي المريض أجّلها بإرادته مبتتحسبش فايتة إلا بعد ما آخر غفوة
           تخلص وتاخد فترة سماح كاملة - قبل كده كانت بترنّ وتتحسب فايتة في نفس
           الدقيقة. */
        AND ${EFFECTIVE_AT} < ?
      ORDER BY d.patient_id, d.scheduled_at`,
    [cairoNowPlusMinutes(-GRACE_MINUTES)]
  );
  if (!rows.length) return;

  await pool.query(
    `UPDATE doses SET status = 'missed' WHERE id IN (${rows.map(() => '?').join(',')})`,
    rows.map((d) => d.id)
  );

  /* الجرعات اللي فات ميعادها من زمان (السيرفر كان نايم) بتتعلّم "فايتة" في
     قاعدة البيانات عادي - الحالة لازم تفضل صح والتقرير بيقرا منها - بس بإشعار
     واحد مجمّع بدل واحد لكل جرعة. */
  const notifyCutoff = cairoNowPlusMinutes(-MISSED_NOTIFY_MAX_LATE_MINUTES);
  const fresh = rows.filter((d) => String(d.effective_at) >= notifyCutoff);
  const stale = rows.filter((d) => String(d.effective_at) < notifyCutoff);

  const caregiversByPatient = new Map();
  const caregiversOf = async (patientId) => {
    if (!caregiversByPatient.has(patientId)) {
      caregiversByPatient.set(patientId, await getCaregiverIds(patientId));
    }
    return caregiversByPatient.get(patientId);
  };

  for (const dose of fresh) {
    const message = `فوّت جرعة "${dose.name}" المحددة الساعة ${formatCairoClock(dose.scheduled_at)}`;

    await notifyUsers(await caregiversOf(dose.patient_id), {
      patientId: dose.patient_id,
      type: 'missed_dose',
      // دواء حرج فايت مش "خبر" - ده اللي التطبيق موجود عشانه
      priority: dose.is_critical ? 'critical' : 'normal',
      relatedId: dose.id,
      dedupeKey: `missed-${dose.id}`,
      message,
      push: {
        title: dose.is_critical ? '⚠️ جرعة مهمة فاتت' : 'جرعة فاتت',
        body: message,
        tag: `missed-${dose.id}`,
        url: '/',
      },
    });
  }

  // المتأخرين: إشعار واحد لكل مريض
  const staleByPatient = new Map();
  for (const dose of stale) {
    if (!staleByPatient.has(dose.patient_id)) staleByPatient.set(dose.patient_id, []);
    staleByPatient.get(dose.patient_id).push(dose);
  }

  for (const [patientId, doses] of staleByPatient) {
    const names = [...new Set(doses.map((d) => d.name))];
    const anyCritical = doses.some((d) => d.is_critical);
    const message =
      doses.length === 1
        ? `فوّت جرعة "${names[0]}" المحددة الساعة ${formatCairoClock(doses[0].scheduled_at)}`
        : `فوّت ${doses.length} جرعات (${names.slice(0, 2).join('، ')}${names.length > 2 ? '...' : ''})`;

    await notifyUsers(await caregiversOf(patientId), {
      patientId,
      type: 'missed_dose',
      priority: anyCritical ? 'critical' : 'normal',
      relatedId: doses[0].id,
      /* مفتاح واحد للدفعة كلها - مش مفتاح لكل جرعة.
         بصمة قصيرة للـ ids بدل ما نقصّ النص: عمود dedupe_key طوله 120، ودفعة
         كبيرة كانت هتتقص - ودفعتين مختلفتين بنفس البداية كانوا هيطلّعوا نفس
         المفتاح، فالتانية تتمنع كتكرار وهي مش تكرار. */
      dedupeKey: `missed-batch-${patientId}-${hashIds(doses.map((d) => d.id))}`,
      message,
      push: {
        title: anyCritical ? '⚠️ جرعات مهمة فاتت' : 'جرعات فاتت',
        body: message,
        tag: `missed-batch-${patientId}`,
        url: '/',
      },
    });
  }
}

// ---------------------------------------------------------------------------
// 4) الجرعة فاتت ومحدش تحرّك → تصعيد حرج للمتابع
// ---------------------------------------------------------------------------

/* الفرق بين ده وبين إشعار "فاتت" اللي فوق: هناك المتابع عرف إن الجرعة فاتت.
   هنا عدى وقت كمان والمريض ما تفاعلش مع أي تنبيه خالص - لا فتح التطبيق ولا
   دوس على الإشعار. ده مش خبر عن جرعة، ده مؤشر إن المريض نفسه ممكن يكون
   محتاج حد يطمّن عليه. عشان كده أولويته حرجة دايمًا (بتخترق ساعات الهدوء).

   الجرعات بتتجمّع لكل مريض في رسالة واحدة: "فوّت 3 جرعات" أحسن بكتير من
   3 إشعارات منفصلة على متابع ممكن يكون متابع أكتر من مريض أصلاً. */
async function escalateMissedDoses() {
  const now = cairoNowString();
  const [rows] = await pool.query(
    `SELECT d.*, m.name
       FROM doses d
       JOIN medications m ON m.id = d.medication_id
      WHERE d.status = 'missed'
        AND m.active = 1
        AND d.escalated_at IS NULL
        AND d.taken_at IS NULL
        AND ${EFFECTIVE_AT} < ?
        /* سقف من ناحية الماضي: جرعة فات ميعادها من ساعات (السيرفر كان نايم)
           مش "المريض مردّش على التنبيه دلوقتي" - هي جرعة محدش بعتله عنها تنبيه
           أصلاً. التصعيد معناه "اطمن عليه حالًا"، ومالوش أي معنى على النهاردة الصبح. */
        AND ${EFFECTIVE_AT} >= ?
      ORDER BY d.patient_id, d.scheduled_at`,
    [
      cairoNowPlusMinutes(-(GRACE_MINUTES + ESCALATE_AFTER_MISSED_MINUTES)),
      cairoNowPlusMinutes(-MISSED_NOTIFY_MAX_LATE_MINUTES),
    ]
  );
  if (!rows.length) return;

  // تجميع حسب المريض
  const byPatient = new Map();
  for (const dose of rows) {
    if (!byPatient.has(dose.patient_id)) byPatient.set(dose.patient_id, []);
    byPatient.get(dose.patient_id).push(dose);
  }

  for (const [patientId, doses] of byPatient) {
    const [patientRows] = await pool.query('SELECT name FROM users WHERE id = ?', [patientId]);
    const patientName = patientRows.length ? patientRows[0].name : 'المريض';

    const names = [...new Set(doses.map((d) => d.name))];
    const message =
      doses.length === 1
        ? `${patientName} مردّش على تنبيه دوا "${names[0]}" بتاع الساعة ${formatCairoClock(doses[0].scheduled_at)}`
        : `${patientName} فوّت ${doses.length} جرعات ومردّش على التنبيهات (${names.slice(0, 2).join('، ')}${
            names.length > 2 ? '...' : ''
          })`;

    const caregiverIds = await getCaregiverIds(patientId);
    await notifyUsers(caregiverIds, {
      patientId,
      type: 'dose_escalation',
      priority: 'critical',
      relatedId: doses[0].id,
      dedupeKey: `escalate-${patientId}-${doses[0].id}`,
      message,
      push: {
        title: '⚠️ محتاج تطمن عليه',
        body: message,
        tag: `escalate-${patientId}`,
        url: '/',
      },
    });

    await pool.query(
      `UPDATE doses SET escalated_at = ? WHERE id IN (${doses.map(() => '?').join(',')})`,
      [now, ...doses.map((d) => d.id)]
    );
  }
}

// ---------------------------------------------------------------------------
// 5) المواعيد الطبية الجاية خلال 24 ساعة
// ---------------------------------------------------------------------------

async function notifyUpcomingAppointments() {
  const [rows] = await pool.query(
    `SELECT * FROM appointments WHERE appointment_at BETWEEN ? AND ?`,
    [cairoNowPlusMinutes(0), cairoNowPlusMinutes(24 * 60)]
  );

  for (const appt of rows) {
    const message = `تذكير: موعد "${appt.title}" ${describeCairoWhen(appt.appointment_at)}`;
    const caregiverIds = await getCaregiverIds(appt.patient_id);

    /* منع التكرار بقى على dedupeKey (قيد UNIQUE في قاعدة البيانات) بدل
       SELECT-ثم-INSERT اللي كان هنا قبل كده. الفرق مش شكلي: الطريقة القديمة
       كانت فيها فجوة سباق حقيقية بين القراية والكتابة. */
    await notifyUsers([appt.patient_id, ...caregiverIds], {
      patientId: appt.patient_id,
      type: 'upcoming_appointment',
      priority: 'info',
      relatedId: appt.id,
      /* الميعاد جزء من المفتاح مش الـ id بس. قبل كده كان `appt-${id}` ثابت:
         المتابع يأجّل الكشف من الخميس للأحد، والـ INSERT IGNORE يرجّع صفر
         لأن المفتاح اتسجّل قبل كده - فمحدش بياخد تذكير بالميعاد الجديد، لا
         المريض ولا المتابع. الميعاد المتغيّر تذكير جديد بالكامل. */
      dedupeKey: `appt-${appt.id}-${String(appt.appointment_at).slice(0, 16)}`,
      message,
      push: {
        title: 'موعد قريب 📅',
        body: message,
        tag: `appt-${appt.id}`,
        url: '/',
        ttl: 24 * 3600,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// 6) تنظيف الإشعارات القديمة
// ---------------------------------------------------------------------------

// إشعار مقروء أقدم من كده مالوش أي قيمة لحد - لا للمستخدم ولا لتتبّع التوصيل
const NOTIFICATION_RETENTION_DAYS = 60;
// التنظيف بيتنفّذ مرة كل الفترة دي، مش كل دورة - الدورة بتلف كل دقيقة
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
let lastCleanupAt = 0;

/* بعد نظام المنبه بقى كل جرعة بتولّد إشعار (أو اتنين). مريض بـ 3 أدوية × جرعتين
   ≈ 10 صفوف في اليوم، يعني ~3,600 في السنة للمريض الواحد غير صفوف المتابعين -
   وده جدول مكانش عليه أي تنظيف خالص.

   بنمسح **المقروء بس**: الإشعار اللي المستخدم لسه مشافوش بيفضل مهما كان قديم،
   لأن اختفاءه معناه إن حاجة حصلت ومحدش عرف بيها أبدًا. */
async function cleanupOldNotifications(force = false) {
  const now = Date.now();
  if (!force && now - lastCleanupAt < CLEANUP_INTERVAL_MS) return 0;
  lastCleanupAt = now;

  const cutoff = `${cairoDateWithOffset(-NOTIFICATION_RETENTION_DAYS, '00:00').slice(0, 10)} 00:00:00`;
  const [result] = await pool.query(
    'DELETE FROM notifications WHERE is_read = 1 AND created_at < ? LIMIT 5000',
    [cutoff]
  );
  if (result.affectedRows) {
    console.log(`🧹 اتمسح ${result.affectedRows} إشعار قديم مقروء`);
  }
  return result.affectedRows;
}

// ---------------------------------------------------------------------------

/* توليد الجرعات مبقاش كل دقيقة.

   الاستعلامات هنا بتعمل INSERT IGNORE لكل دواء × كل ميعاد × يومين. النتيجة
   كانت صح دايمًا بس الشغل مكرر بالكامل: عند 100 مريض بـ 3 أدوية × 3 مواعيد
   بقى 1,800 استعلام في الدقيقة على قاعدة بيانات مستضافة بره - كلهم بيرجّعوا
   "الصف موجود".

   الجرعات بتتولّد لليوم وبكرة، فدورة كل ساعة أكتر من كافية. وأي دواء جديد أو
   معدّل بيولّد جرعاته **فورًا** من الراوت نفسه (routes/medications.js) - فمفيش
   أي تأخير يحسه المستخدم. */
const GENERATE_INTERVAL_MS = 60 * 60 * 1000;
let lastGenerateAt = 0;

async function runOnce() {
  if (Date.now() - lastGenerateAt >= GENERATE_INTERVAL_MS) {
    lastGenerateAt = Date.now();
    await generateDoses();
  }
  await notifyDueDoses();
  await notifyDoseReminders();
  await markMissedAndNotify();
  await escalateMissedDoses();
  await notifyUpcomingAppointments();
  await cleanupOldNotifications();
}

function startScheduler() {
  const run = async () => {
    try {
      await runOnce();
    } catch (e) {
      console.error('scheduler error:', e.message);
    }
  };
  run();
  setInterval(run, RUN_INTERVAL_MS);
  console.log(`⏰ scheduler: كل ${RUN_INTERVAL_MS / 1000} ثانية`);
}

module.exports = {
  startScheduler,
  runOnce,
  generateDosesForMedication,
  generateDoses,
  cleanupStaleDoses,
  notifyDueDoses,
  notifyDoseReminders,
  markMissedAndNotify,
  escalateMissedDoses,
  notifyUpcomingAppointments,
  cleanupOldNotifications,
  NOTIFICATION_RETENTION_DAYS,
  REMINDER_MINUTES,
  GRACE_MINUTES,
  ESCALATE_AFTER_MISSED_MINUTES,
  MISSED_NOTIFY_MAX_LATE_MINUTES,
  SNOOZE_MINUTES,
  MAX_SNOOZES,
};
