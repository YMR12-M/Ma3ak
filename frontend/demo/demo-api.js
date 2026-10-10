/* ============================================
   MA3ak (معاك) - الباك إند التجريبي اللي بيشتغل جوه المتصفح

   ليه الملف ده موجود؟
   التطبيق الحقيقي محتاج سيرفر شغّال طول الوقت (بيبعت تنبيهات الجرعات كل دقيقة)
   وقاعدة MySQL - ومفيش استضافة مجانية بتديك الاتنين. فللعرض بس، الملف ده بيحل
   محل السيرفر بالكامل: بيعترض أي طلب لـ /api/* ويرد عليه من بيانات متخزنة في
   localStorage عند الزائر نفسه.

   يعني:
     - كل زائر معاه نسخته الخاصة من البيانات (محدش بيشوف بيانات حد).
     - مفيش أي حاجة بتتبعت لأي سيرفر ولا بتتخزن في أي قاعدة بيانات.
     - تنبيهات الدفع (Web Push) مش شغالة - دي محتاجة سيرفر حقيقي.

   الملف ده مش بيتحمّل في النسخة الحقيقية خالص: بيتحط في index.html بتاع
   النسخة التجريبية بس (scripts/build-demo.js). ومفيش أي تعديل على كود
   الواجهة - هي فاكرة إنها بتكلّم السيرفر الحقيقي.

   الأشكال (shapes) بتتبع docs/API.md وbackend/routes/*.js بالظبط.
   ============================================ */

(function () {
  'use strict';
  if (window.__MA3AK_DEMO__) return;
  window.__MA3AK_DEMO__ = true;

  var DB_KEY = 'ma3ak_demo_db_v1';
  var TZ = 'Africa/Cairo';
  var DOSE_EARLY_MINUTES = 15;
  var DOSE_LATE_TAKE_HOURS = 12;
  var SNOOZE_MINUTES = 10;
  var MAX_SNOOZES = 3;
  var MISSED_AFTER_MINUTES = 30; // الجرعة بتتحوّل "فايتة" بعد نص ساعة (زي scheduler.js)
  var REMINDER_AFTER_MINUTES = 10;
  var ESCALATE_AFTER_MINUTES = 60;
  var HISTORY_DAYS = 14;

  var DEMO_CAREGIVER = { phone: '01000000001', password: '123456' };

  /* ---------- الوقت (بتوقيت مصر، نص خام زي أعمدة DATETIME) ---------- */

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function cairoParts(date) {
    var parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date);
    function get(type) {
      return Number(
        parts.find(function (p) {
          return p.type === type;
        }).value
      );
    }
    var hour = get('hour');
    if (hour === 24) hour = 0;
    return { y: get('year'), mo: get('month'), d: get('day'), h: hour, mi: get('minute'), s: get('second') };
  }

  function partsToStr(p) {
    return p.y + '-' + pad(p.mo) + '-' + pad(p.d) + ' ' + pad(p.h) + ':' + pad(p.mi) + ':' + pad(p.s);
  }

  function nowStr() {
    return partsToStr(cairoParts(new Date()));
  }

  // كل المقارنات بتحصل في "فضاء مصر الخام": نص → ميللي ثانية كأنه UTC. مهم بس إنها متّسقة.
  function strToMs(str) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(String(str));
    if (!m) return NaN;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }

  function msToStr(ms) {
    var d = new Date(ms);
    return (
      d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + ' ' +
      pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds())
    );
  }

  function today() {
    return nowStr().slice(0, 10);
  }

  function addDays(dateStr, n) {
    return msToStr(strToMs(dateStr) + n * 86400000).slice(0, 10);
  }

  function weekday(dateStr) {
    return new Date(strToMs(dateStr)).getUTCDay(); // 0 = الأحد
  }

  function clockLabel(str) {
    var h = Number(String(str).slice(11, 13));
    var mm = String(str).slice(14, 16);
    return (h % 12 || 12) + ':' + mm + ' ' + (h < 12 ? 'ص' : 'م');
  }

  function isValidDate(s) {
    return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && msToStr(strToMs(s)).slice(0, 10) === s;
  }

  function normalizeDateTime(s) {
    var m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(s || ''));
    if (!m || !isValidDate(m[1])) return null;
    return m[1] + ' ' + m[2] + ':' + m[3] + ':' + (m[4] || '00');
  }

  /* ---------- التخزين ---------- */

  var db = null;

  function load() {
    try {
      var raw = localStorage.getItem(DB_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.v === 1) return parsed;
      }
    } catch (e) {
      /* التخزين المحلي مقفول - هنكمّل في الذاكرة بس */
    }
    return null;
  }

  function save() {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch (e) {
      /* الكوتا خلصت أو التخزين مقفول - الجلسة الحالية لسه شغالة من الذاكرة */
    }
  }

  function nextId(kind) {
    db.seq[kind] += 1;
    return db.seq[kind];
  }

  /* ---------- بيانات البداية ---------- */

  // رقم ثابت من نص، عشان تاريخ الجرعات المتسجّلة يبقى متكرر ومش عشوائي في كل مرة
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) % 1000;
  }

  function randomCode(length, alphabet) {
    var out = '';
    for (var i = 0; i < length; i += 1) out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    return out;
  }

  function makeMed(patientId, spec) {
    return {
      id: nextId('med'),
      patient_id: patientId,
      name: spec.name,
      dosage: spec.dosage || null,
      notes: spec.notes || null,
      times: spec.times,
      days_of_week: spec.days === undefined ? 127 : spec.days,
      pills_left: spec.pills === undefined ? null : spec.pills,
      low_stock_notified_at: null,
      start_date: addDays(today(), -30),
      end_date: null,
      active: 1,
      is_critical: spec.critical ? 1 : 0,
      snooze_allowed: spec.critical ? 0 : 1,
      has_image: 0,
      created_at: addDays(today(), -30) + ' 09:00:00',
    };
  }

  function seed() {
    db = {
      v: 1,
      seq: { user: 3, med: 0, dose: 0, appt: 0, vital: 0, notif: 0 },
      users: [
        { id: 1, name: 'منى أحمد', email: null, phone: DEMO_CAREGIVER.phone, role: 'caregiver',
          password: DEMO_CAREGIVER.password, recovery: 'DEMO2026', link_code: null, access_token: null },
        { id: 2, name: 'الحاج محمد', email: null, phone: '01000000002', role: 'patient',
          password: null, recovery: null, link_code: 'HAJ123', access_token: 'DEMOHAJMOHAMED' },
        { id: 3, name: 'تيتة سعاد', email: null, phone: null, role: 'patient',
          password: null, recovery: null, link_code: 'SOAD45', access_token: 'DEMOSOAD' },
      ],
      links: [{ patient_id: 2, caregiver_id: 1 }, { patient_id: 3, caregiver_id: 1 }],
      meds: [],
      doses: [],
      appts: [],
      vitals: [],
      notifs: [],
      prefs: {},
      images: {},
    };

    db.meds.push(
      makeMed(2, { name: 'كونكور 5 مجم', dosage: 'قرص', notes: 'خده بعد الفطار والعشا', times: ['08:00', '20:00'], pills: 24 }),
      makeMed(2, { name: 'جلوكوفاج 500', dosage: 'قرص', notes: 'مع الأكل مش على معدة فاضية', times: ['08:00', '14:00', '20:00'], pills: 60 }),
      makeMed(2, { name: 'أسبرين 75', dosage: 'قرص', notes: 'بعد الغدا بساعة', times: ['14:00'], pills: 4 }),
      makeMed(2, { name: 'إنسولين لانتوس', dosage: '10 وحدات', notes: 'حقنة تحت الجلد - توقيتها مهم', times: ['22:00'], critical: true, pills: 12 }),
      makeMed(3, { name: 'فيتامين د', dosage: 'كبسولة', times: ['09:00'], pills: 30 }),
      makeMed(3, { name: 'كالسيوم', dosage: 'قرص', notes: 'بعد الأكل', times: ['13:00', '21:00'], pills: 45 })
    );

    // تاريخ آخر 14 يوم + النهارده وبكرة
    var start = addDays(today(), -HISTORY_DAYS);
    generateDoses(start, addDays(today(), 1));
    var nowMs = strToMs(nowStr());
    db.doses.forEach(function (d) {
      var eff = strToMs(d.scheduled_at);
      if (eff + MISSED_AFTER_MINUTES * 60000 > nowMs) return; // لسه في الجاية أو في نافذة الإنذار
      var h = hash(d.medication_id + '|' + d.scheduled_at);
      var evening = Number(d.scheduled_at.slice(11, 13)) >= 20;
      var missedChance = evening ? 220 : 90; // الجرعة المسائية بتتنسى أكتر - بيطلّع نمط في تقرير الالتزام
      if (h < missedChance) {
        d.status = 'missed';
      } else {
        d.status = 'taken';
        d.taken_at = msToStr(eff + (h % 18) * 60000);
      }
      d.due_notified_at = d.scheduled_at;
      d.reminder_notified_at = d.scheduled_at;
    });

    var n = nowStr();
    function notif(userId, patientId, type, priority, message, minutesAgo, extra) {
      var row = {
        id: nextId('notif'), user_id: userId, patient_id: patientId, type: type, priority: priority,
        related_id: null, message: message, is_read: 0, handled_at: null,
        created_at: msToStr(strToMs(n) - minutesAgo * 60000),
      };
      for (var k in extra || {}) row[k] = extra[k];
      db.notifs.push(row);
    }
    // الإشعارات المبدئية بتتحط على أوقات ثابتة من امبارح (مش "من X ساعة") عشان وقت الإشعار
    // يفضل منطقي بالنسبة لميعاد الجرعة اللي بيتكلّم عنها مهما كانت ساعة فتح الزائر.
    var yesterday = addDays(today(), -1);
    // الترتيب من الأقدم للأحدث: الواجهة بترتّب بالـ id تنازليًا
    notif(1, 3, 'upcoming_appointment', 'info', 'تذكير: موعد "كشف عيون" بعد 10 أيام', 0,
      { created_at: yesterday + ' 09:00:00', is_read: 1 });
    notif(1, 2, 'missed_dose', 'normal', 'الحاج محمد فوّت جرعة "جلوكوفاج 500" المحددة الساعة 8:00 م', 0,
      { created_at: yesterday + ' 20:30:00' });
    notif(1, 2, 'missed_dose', 'critical', 'الحاج محمد فوّت جرعة "إنسولين لانتوس" المحددة الساعة 10:00 م', 0,
      { created_at: yesterday + ' 22:30:00', is_read: 1, handled_at: yesterday + ' 22:45:00' });
    notif(1, 2, 'patient_issue', 'normal', 'الحاج محمد بلّغ إن دوا "أسبرين 75" خلص وعايز عبوة جديدة', 95);

    var d1 = addDays(today(), 3);
    var d2 = addDays(today(), 6);
    var d3 = addDays(today(), 10);
    db.appts.push(
      { id: nextId('appt'), patient_id: 2, title: 'متابعة قلب', doctor_name: 'د. أحمد سمير', location: 'عيادة الأمل - مدينة نصر', appointment_at: d1 + ' 11:00:00', notes: 'ييجي ومعاه آخر رسم قلب', created_at: n },
      { id: nextId('appt'), patient_id: 2, title: 'تحليل سكر صايم', doctor_name: null, location: 'معمل البرج', appointment_at: d2 + ' 08:00:00', notes: 'صيام 8 ساعات قبلها', created_at: n },
      { id: nextId('appt'), patient_id: 3, title: 'كشف عيون', doctor_name: 'د. هالة فؤاد', location: 'مستشفى العيون', appointment_at: d3 + ' 10:30:00', notes: null, created_at: n }
    );

    // قياسات آخر 10 أيام للحاج محمد
    for (var i = 9; i >= 0; i -= 1) {
      var day = addDays(today(), -i);
      var r = hash('v' + day);
      db.vitals.push(
        { id: nextId('vital'), patient_id: 2, type: 'blood_pressure', value_json: { systolic: 118 + (r % 32), diastolic: 76 + (r % 14) }, recorded_at: day + ' 09:10:00', created_at: n },
        { id: nextId('vital'), patient_id: 2, type: 'blood_sugar', value_json: { value: 96 + (r % 90), unit: 'mg/dL' }, recorded_at: day + ' 07:40:00', created_at: n }
      );
      if (i % 3 === 0) {
        db.vitals.push({ id: nextId('vital'), patient_id: 2, type: 'weight', value_json: { value: 78 + (r % 3), unit: 'كجم' }, recorded_at: day + ' 08:00:00', created_at: n });
      }
    }
    save();
  }

  /* ---------- توليد الجرعات (نظير generateDosesForMedication في scheduler.js) ---------- */

  function generateDosesForMed(med, fromDay, toDay) {
    if (!med.active) return;
    for (var day = fromDay; day <= toDay; day = addDays(day, 1)) {
      if (day < med.start_date) continue;
      if (med.end_date && day > med.end_date) continue;
      if (!(med.days_of_week & (1 << weekday(day)))) continue;
      med.times.forEach(function (t) {
        var at = day + ' ' + t + ':00';
        var exists = db.doses.some(function (d) {
          return d.medication_id === med.id && d.scheduled_at === at;
        });
        if (exists) return;
        db.doses.push({
          id: nextId('dose'), medication_id: med.id, patient_id: med.patient_id, scheduled_at: at,
          status: 'pending', snooze_until: null, snooze_count: 0, snooze_notified_at: null, taken_at: null,
          due_notified_at: null, reminder_notified_at: null, escalated_at: null,
        });
      });
    }
  }

  function generateDoses(fromDay, toDay) {
    db.meds.forEach(function (m) {
      generateDosesForMed(m, fromDay, toDay);
    });
  }

  /* ---------- "الـ scheduler": بيتنفّذ مع كل طلب بدل ما يبقى فيه عملية شغالة ---------- */

  function medOf(id) {
    return db.meds.find(function (m) {
      return m.id === id;
    });
  }

  function userOf(id) {
    return db.users.find(function (u) {
      return u.id === id;
    });
  }

  function caregiverIds(patientId) {
    return db.links
      .filter(function (l) {
        return l.patient_id === patientId;
      })
      .map(function (l) {
        return l.caregiver_id;
      });
  }

  function addNotif(userId, patientId, type, priority, message, relatedId, dedupe) {
    if (dedupe) {
      var dup = db.notifs.some(function (n) {
        return n.user_id === userId && n.dedupe_key === dedupe;
      });
      if (dup) return;
    }
    db.notifs.push({
      id: nextId('notif'), user_id: userId, patient_id: patientId, type: type, priority: priority,
      related_id: relatedId || null, dedupe_key: dedupe || null, message: String(message).slice(0, 255),
      is_read: 0, handled_at: null, created_at: nowStr(),
    });
  }

  function tick() {
    var changed = false;
    var t = today();
    var before = db.doses.length;
    generateDoses(t, addDays(t, 1));
    if (db.doses.length !== before) changed = true;

    var nowMs = strToMs(nowStr());
    db.doses.forEach(function (d) {
      if (d.status !== 'pending') return;
      var med = medOf(d.medication_id);
      if (!med) return;
      var eff = strToMs(d.snooze_until || d.scheduled_at);
      var minsLate = (nowMs - eff) / 60000;
      var critical = med.is_critical ? 'critical' : 'normal';
      var patient = userOf(d.patient_id);
      var name = patient ? patient.name : 'المريض';

      if (nowMs >= strToMs(d.scheduled_at) && !d.due_notified_at) {
        d.due_notified_at = nowStr();
        addNotif(d.patient_id, d.patient_id, 'dose_due', critical,
          'وقت دوا "' + med.name + '" الساعة ' + clockLabel(d.scheduled_at), d.id, 'due-' + d.id);
        changed = true;
      }
      if (minsLate >= REMINDER_AFTER_MINUTES && !d.reminder_notified_at) {
        d.reminder_notified_at = nowStr();
        addNotif(d.patient_id, d.patient_id, 'dose_reminder', critical,
          'لسه مسجلتش دوا "' + med.name + '" بتاع الساعة ' + clockLabel(d.scheduled_at), d.id, 'rem-' + d.id);
        changed = true;
      }
      if (minsLate >= MISSED_AFTER_MINUTES) {
        d.status = 'missed';
        caregiverIds(d.patient_id).forEach(function (cid) {
          addNotif(cid, d.patient_id, 'missed_dose', critical,
            name + ' فوّت جرعة "' + med.name + '" المحددة الساعة ' + clockLabel(d.scheduled_at), d.id, 'miss-' + d.id);
        });
        changed = true;
      }
    });

    db.doses.forEach(function (d) {
      if (d.status !== 'missed' || d.escalated_at || d.taken_at) return;
      var minsLate = (nowMs - strToMs(d.scheduled_at)) / 60000;
      if (minsLate < ESCALATE_AFTER_MINUTES || minsLate > 6 * 60) return;
      var med = medOf(d.medication_id);
      if (!med || !med.is_critical) return;
      d.escalated_at = nowStr();
      var patient = userOf(d.patient_id);
      caregiverIds(d.patient_id).forEach(function (cid) {
        addNotif(cid, d.patient_id, 'dose_escalation', 'critical',
          (patient ? patient.name : 'المريض') + ' ماردّش خالص على جرعة "' + med.name + '" الساعة ' + clockLabel(d.scheduled_at),
          d.id, 'esc-' + d.id);
      });
      changed = true;
    });

    if (changed) save();
  }

  /* ---------- أدوات الـ routing ---------- */

  function ok(body, status) {
    return { status: status || 200, body: body };
  }

  function fail(status, message) {
    return { status: status, body: { error: message } };
  }

  function tokenFor(user) {
    return 'demo.' + user.id + '.' + randomCode(10, 'abcdefghijklmnopqrstuvwxyz0123456789');
  }

  function userFromAuth(headers) {
    var h = headers && (headers.Authorization || headers.authorization);
    var m = /^Bearer demo\.(\d+)\./.exec(h || '');
    if (!m) return null;
    return userOf(Number(m[1])) || null;
  }

  function publicUser(u) {
    return { id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone };
  }

  function canAccess(user, patientId) {
    patientId = Number(patientId);
    if (user.role === 'patient') return user.id === patientId;
    return db.links.some(function (l) {
      return l.patient_id === patientId && l.caregiver_id === user.id;
    });
  }

  function sortBy(arr, key, dir) {
    return arr.slice().sort(function (a, b) {
      return a[key] < b[key] ? -dir : a[key] > b[key] ? dir : 0;
    });
  }

  function medRow(m) {
    return Object.assign({}, m);
  }

  function doseJoined(d) {
    var m = medOf(d.medication_id) || {};
    return {
      id: d.id, scheduled_at: d.scheduled_at, status: d.status, taken_at: d.taken_at,
      snooze_until: d.snooze_until, snooze_count: d.snooze_count, due_notified_at: d.due_notified_at,
      medication_id: d.medication_id, name: m.name, dosage: m.dosage, notes: m.notes,
      has_image: m.has_image, is_critical: m.is_critical, snooze_allowed: m.snooze_allowed,
    };
  }

  function validateMedication(b) {
    if (!b.name || !String(b.name).trim()) return 'من فضلك اكتب اسم الدواء';
    if (String(b.name).length > 150) return 'اسم الدواء طويل أوي (أقصى 150 حرف)';
    var times = b.times;
    if (!Array.isArray(times) || !times.length) return 'اختار ميعاد واحد على الأقل للجرعة';
    if (times.length > 12) return 'أقصى عدد مواعيد 12 في اليوم';
    var seen = {};
    for (var i = 0; i < times.length; i += 1) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(times[i])) return 'ميعاد الجرعة مش مكتوب صح';
      if (seen[times[i]]) return 'فيه ميعاد متكرر';
      seen[times[i]] = true;
    }
    if (!isValidDate(b.startDate)) return 'تاريخ البداية مش مكتوب صح';
    if (b.endDate && !isValidDate(b.endDate)) return 'تاريخ النهاية مش مكتوب صح';
    if (b.endDate && b.endDate < b.startDate) return 'تاريخ النهاية لازم يكون بعد تاريخ البداية';
    return null;
  }

  function parseDays(value) {
    if (value === undefined || value === null || value === '') return { mask: 127 };
    var mask = 0;
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i += 1) {
        var d = Number(value[i]);
        if (!Number.isInteger(d) || d < 0 || d > 6) return { error: 'أيام الأسبوع مش مكتوبة صح' };
        mask |= 1 << d;
      }
    } else {
      mask = Number(value);
    }
    if (!Number.isInteger(mask) || mask < 0 || mask > 127) return { error: 'أيام الأسبوع مش مكتوبة صح' };
    if (mask === 0) return { error: 'لازم تختار يوم واحد على الأقل في الأسبوع' };
    return { mask: mask };
  }

  function parsePills(value) {
    if (value === undefined || value === null || value === '') return { pills: null };
    var n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > 9999) return { error: 'عدد الأقراص لازم يكون رقم صحيح' };
    return { pills: n };
  }

  var ISSUES = {
    med_finished: { label: 'الدوا خلص وعايز عبوة جديدة', urgent: false },
    forgot_dose: { label: 'نسي ياخد جرعة', urgent: false },
    side_effect: { label: 'حاسس بتعب أو حاجة غريبة بعد الدوا', urgent: true },
    unclear_dose: { label: 'مش متأكد إزاي ياخد الدوا', urgent: false },
    want_call: { label: 'عايز حد يتصل بيه دلوقتي', urgent: true },
    other: { label: 'عنده مشكلة تانية', urgent: false },
  };

  var RANGES = { systolic: [40, 300], diastolic: [20, 200], blood_sugar: [10, 900], weight: [1, 400], heart_rate: [20, 300], temperature: [25, 45] };
  var CRITICAL = {
    systolic: { low: 90, high: 180 }, diastolic: { low: 50, high: 120 }, blood_sugar: { low: 70, high: 300 },
    heart_rate: { low: 45, high: 130 }, temperature: { low: 35, high: 39 },
  };
  var VITAL_TYPES = ['blood_pressure', 'blood_sugar', 'weight', 'heart_rate', 'temperature'];

  function inRange(n, r) {
    return Number.isFinite(n) && n >= r[0] && n <= r[1];
  }

  function validateVital(type, v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return 'قيمة القياس مش مكتوبة صح';
    if (type === 'blood_pressure') {
      if (!inRange(Number(v.systolic), RANGES.systolic) || !inRange(Number(v.diastolic), RANGES.diastolic)) {
        return 'قيم الضغط مش منطقية - راجع الأرقام';
      }
      return null;
    }
    if (!inRange(Number(v.value), RANGES[type])) return 'القيمة دي مش منطقية - راجع الرقم';
    return null;
  }

  function describeCritical(type, v) {
    function side(n, lim) {
      return n >= lim.high ? 'مرتفع' : n <= lim.low ? 'منخفض' : null;
    }
    if (type === 'blood_pressure') {
      var s = side(Number(v.systolic), CRITICAL.systolic) || side(Number(v.diastolic), CRITICAL.diastolic);
      return s ? 'ضغط ' + s + ': ' + Number(v.systolic) + '/' + Number(v.diastolic) : null;
    }
    var lim = CRITICAL[type];
    if (!lim) return null;
    var state = side(Number(v.value), lim);
    if (!state) return null;
    var labels = { blood_sugar: ['سكر', 'mg/dL'], heart_rate: ['نبض', 'نبضة/دقيقة'], temperature: ['حرارة', '°C'] };
    return labels[type][0] + ' ' + state + ': ' + Number(v.value) + ' ' + labels[type][1];
  }

  /* ---------- الراوتر ---------- */

  function route(method, path, query, body, user) {
    var m;
    body = body || {};

    /* --- من غير مصادقة --- */
    if (method === 'POST' && path === '/auth/register') {
      var name = String(body.name || '').trim();
      var phone = String(body.phone || '').trim();
      if (!name || !phone || !body.password) return fail(400, 'من فضلك اكتب الاسم ورقم الموبايل وكلمة المرور');
      if (String(body.password).length < 6) return fail(400, 'كلمة المرور لازم تكون 6 حروف على الأقل');
      if (!/^[0-9+\s-]{7,20}$/.test(phone)) return fail(400, 'رقم الموبايل مش مكتوب صح');
      if (db.users.some(function (u) { return u.phone === phone; })) return fail(409, 'رقم الموبايل ده مسجل قبل كده');
      var email = body.email ? String(body.email).trim() : null;
      if (email && db.users.some(function (u) { return u.email === email; })) return fail(409, 'الإيميل ده مسجل قبل كده');
      var recovery = randomCode(8, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789');
      var u = { id: nextId('user'), name: name, email: email, phone: phone, role: 'caregiver',
        password: String(body.password), recovery: recovery, link_code: null, access_token: null };
      db.users.push(u);
      save();
      return ok({ token: tokenFor(u), recoveryCode: recovery, user: publicUser(u) }, 201);
    }

    if (method === 'POST' && path === '/auth/login') {
      var ident = String(body.identifier || '').trim();
      if (!ident || !body.password) return fail(400, 'اكتب رقم الموبايل أو الإيميل وكلمة المرور');
      var found = db.users.find(function (x) {
        return x.role === 'caregiver' && (x.phone === ident || (x.email && x.email === ident));
      });
      if (!found || found.password !== String(body.password)) return fail(401, 'البيانات غير صحيحة');
      return ok({ token: tokenFor(found), user: publicUser(found) });
    }

    if (method === 'POST' && path === '/auth/access') {
      var at = String(body.token || '').trim();
      if (!at) return fail(400, 'اللينك غير صالح');
      var pat = db.users.find(function (x) {
        return x.role === 'patient' && x.access_token === at;
      });
      if (!pat) return fail(404, 'اللينك ده مش شغال، اطلب واحد جديد من اللي بيتابعك');
      return ok({ token: tokenFor(pat), user: publicUser(pat) });
    }

    if (method === 'POST' && path === '/auth/recover') {
      var rp = String(body.phone || '').trim();
      var rc = String(body.recoveryCode || '').trim().toUpperCase();
      var ru = db.users.find(function (x) {
        return x.role === 'caregiver' && x.phone === rp;
      });
      if (!ru || !ru.recovery || ru.recovery !== rc) return fail(401, 'رقم الموبايل أو كود الاسترجاع غلط');
      if (!body.newPassword || String(body.newPassword).length < 6) return fail(400, 'كلمة المرور الجديدة لازم تكون 6 حروف على الأقل');
      ru.password = String(body.newPassword);
      ru.recovery = randomCode(8, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789');
      save();
      return ok({ ok: true, token: tokenFor(ru), recoveryCode: ru.recovery });
    }

    if (method === 'GET' && path === '/push/public-key') {
      // مفيش سيرفر دفع هنا - الواجهة بتعرض "التنبيهات مش مفعّلة" بدل ما تتظاهر إنها شغالة
      return ok({ publicKey: null, enabled: false });
    }

    if (method === 'POST' && (path === '/doses/action' || path === '/notifications/ack')) {
      return ok({ ok: true });
    }

    /* --- محتاجة مصادقة --- */
    if (!user) return fail(401, 'لازم تسجّل دخول الأول');

    if (method === 'GET' && path === '/auth/me') return ok({ user: publicUser(user) });

    if (method === 'POST' && path === '/auth/change-password') {
      if (user.role !== 'caregiver') return fail(400, 'الحساب ده مالوش كلمة مرور');
      if (!body.currentPassword || !body.newPassword) return fail(400, 'اكتب كلمة المرور الحالية والجديدة');
      if (String(body.newPassword).length < 6) return fail(400, 'كلمة المرور الجديدة لازم تكون 6 حروف على الأقل');
      if (user.password !== String(body.currentPassword)) return fail(401, 'كلمة المرور الحالية غلط');
      user.password = String(body.newPassword);
      save();
      return ok({ ok: true });
    }

    /* --- المرضى --- */
    if (method === 'GET' && path === '/patients') {
      if (user.role === 'patient') {
        return ok({ patients: [{ id: user.id, name: user.name, email: user.email, phone: user.phone }] });
      }
      var mine = caregiverPatients(user.id);
      return ok({
        patients: sortBy(mine, 'name', 1).map(function (p) {
          return { id: p.id, name: p.name, email: p.email, phone: p.phone, link_code: p.link_code, access_token: p.access_token };
        }),
      });
    }

    if (method === 'POST' && path === '/patients') {
      if (user.role !== 'caregiver') return fail(403, 'المتابعين بس اللي يقدروا يضيفوا مريض');
      var pn = String(body.name || '').trim();
      if (!pn) return fail(400, 'من فضلك اكتب اسم المريض');
      var np = { id: nextId('user'), name: pn, email: null, phone: body.phone ? String(body.phone).trim() : null,
        role: 'patient', password: null, recovery: null,
        link_code: randomCode(6, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'),
        access_token: randomCode(24, 'abcdefghijklmnopqrstuvwxyz0123456789') };
      db.users.push(np);
      db.links.push({ patient_id: np.id, caregiver_id: user.id });
      save();
      return ok({ patient: { id: np.id, name: np.name, phone: np.phone, link_code: np.link_code, access_token: np.access_token } }, 201);
    }

    if (method === 'POST' && path === '/patients/link') {
      if (user.role !== 'caregiver') return fail(403, 'المتابعين بس اللي ممكن يربطوا مريض');
      var code = String(body.code || '').trim().toUpperCase();
      if (!code) return fail(400, 'من فضلك اكتب كود المشاركة');
      var lp = db.users.find(function (x) {
        return x.role === 'patient' && x.link_code === code;
      });
      if (!lp) return fail(404, 'الكود غير صحيح');
      if (canAccess(user, lp.id)) return fail(409, 'انت بتتابع المريض ده بالفعل');
      db.links.push({ patient_id: lp.id, caregiver_id: user.id });
      save();
      return ok({ patient: { id: lp.id, name: lp.name, phone: lp.phone } }, 201);
    }

    if ((m = /^\/patients\/(\d+)(?:\/(.+))?$/.exec(path))) {
      return patientRoute(method, Number(m[1]), m[2] || '', query, body, user);
    }

    /* --- الأدوية --- */
    if (path === '/medications' && method === 'GET') {
      if (!query.patientId) return fail(400, 'لازم تحدد المريض');
      if (!canAccess(user, query.patientId)) return fail(403, 'مفيش صلاحية');
      var meds = db.meds.filter(function (x) {
        return x.patient_id === Number(query.patientId) && x.active;
      });
      return ok({ medications: sortBy(meds, 'id', -1).map(medRow) });
    }

    if ((m = /^\/medications\/(\d+)\/today$/.exec(path)) && method === 'GET') {
      if (!canAccess(user, m[1])) return fail(403, 'مفيش صلاحية');
      var t = today();
      var rows = db.doses.filter(function (d) {
        var med = medOf(d.medication_id);
        return d.patient_id === Number(m[1]) && d.scheduled_at.slice(0, 10) === t && med && med.active;
      });
      return ok({ doses: sortBy(rows, 'scheduled_at', 1).map(doseJoined) });
    }

    if (path === '/medications' && method === 'POST') {
      if (!body.patientId) return fail(400, 'لازم تحدد المريض');
      var err = validateMedication(body);
      if (err) return fail(400, err);
      if (!canAccess(user, body.patientId)) return fail(403, 'مفيش صلاحية');
      var days = parseDays(body.daysOfWeek);
      if (days.error) return fail(400, days.error);
      var pills = parsePills(body.pillsLeft);
      if (pills.error) return fail(400, pills.error);
      var med = {
        id: nextId('med'), patient_id: Number(body.patientId), name: String(body.name).trim(),
        dosage: body.dosage ? String(body.dosage).trim() : null, notes: body.notes ? String(body.notes).trim() : null,
        times: body.times.slice().sort(), days_of_week: days.mask, pills_left: pills.pills, low_stock_notified_at: null,
        start_date: body.startDate, end_date: body.endDate || null, active: 1,
        is_critical: body.isCritical ? 1 : 0,
        snooze_allowed: body.isCritical ? 0 : body.snoozeAllowed === false ? 0 : 1,
        has_image: 0, created_at: nowStr(),
      };
      db.meds.push(med);
      generateDosesForMed(med, today(), addDays(today(), 1));
      save();
      return ok({ id: med.id }, 201);
    }

    if ((m = /^\/medications\/(\d+)$/.exec(path)) && (method === 'PUT' || method === 'DELETE')) {
      var mm = medOf(Number(m[1]));
      if (!mm) return fail(404, 'الدواء مش موجود');
      if (!canAccess(user, mm.patient_id)) return fail(403, 'مفيش صلاحية');
      if (method === 'DELETE') {
        mm.active = 0;
        db.doses = db.doses.filter(function (d) {
          return !(d.medication_id === mm.id && d.status === 'pending' && d.scheduled_at > nowStr());
        });
        save();
        return ok({ ok: true });
      }
      var merged = {
        name: body.name !== undefined ? body.name : mm.name,
        times: body.times !== undefined ? body.times : mm.times,
        startDate: body.startDate !== undefined ? body.startDate : mm.start_date,
        endDate: body.endDate !== undefined ? body.endDate : mm.end_date,
      };
      var perr = validateMedication(merged);
      if (perr) return fail(400, perr);
      if (body.daysOfWeek !== undefined) {
        var pd = parseDays(body.daysOfWeek);
        if (pd.error) return fail(400, pd.error);
        mm.days_of_week = pd.mask;
      }
      if (body.pillsLeft !== undefined) {
        var pp = parsePills(body.pillsLeft);
        if (pp.error) return fail(400, pp.error);
        mm.pills_left = pp.pills;
      }
      mm.name = String(merged.name).trim();
      mm.times = merged.times.slice().sort();
      mm.start_date = merged.startDate;
      mm.end_date = merged.endDate || null;
      if (body.dosage !== undefined) mm.dosage = body.dosage ? String(body.dosage).trim() : null;
      if (body.notes !== undefined) mm.notes = body.notes ? String(body.notes).trim() : null;
      if (body.isCritical !== undefined) mm.is_critical = body.isCritical ? 1 : 0;
      if (body.snoozeAllowed !== undefined) mm.snooze_allowed = body.snoozeAllowed ? 1 : 0;
      if (mm.is_critical) mm.snooze_allowed = 0;
      // نضّف الجرعات الجاية اللي ميعادها اتشال، وبعدها ولّد الجديد (زي cleanupStaleDoses)
      var nowS = nowStr();
      db.doses = db.doses.filter(function (d) {
        if (d.medication_id !== mm.id || d.status !== 'pending' || d.scheduled_at <= nowS) return true;
        var stale = mm.times.indexOf(d.scheduled_at.slice(11, 16)) === -1 ||
          !(mm.days_of_week & (1 << weekday(d.scheduled_at.slice(0, 10))));
        return !stale;
      });
      generateDosesForMed(mm, today(), addDays(today(), 1));
      save();
      return ok({ ok: true });
    }

    if ((m = /^\/medications\/(\d+)\/image$/.exec(path))) {
      var im = medOf(Number(m[1]));
      if (!im) return fail(404, 'الدواء مش موجود');
      if (!canAccess(user, im.patient_id)) return fail(403, 'مفيش صلاحية');
      if (method === 'GET') {
        if (!db.images[im.id]) return fail(404, 'مفيش صورة للدواء ده');
        return ok({ dataUrl: db.images[im.id] });
      }
      if (method === 'PUT') {
        if (!body.data || !body.mime) return fail(400, 'الصورة مش مبعوتة صح');
        db.images[im.id] = 'data:' + body.mime + ';base64,' + body.data;
        im.has_image = 1;
        save();
        return ok({ ok: true });
      }
      if (method === 'DELETE') {
        delete db.images[im.id];
        im.has_image = 0;
        save();
        return ok({ ok: true });
      }
    }

    /* --- الجرعات --- */
    if ((m = /^\/doses\/(\d+)\/(take|snooze)$/.exec(path)) && method === 'POST') {
      return doseAction(user, Number(m[1]), m[2]);
    }

    if (path === '/doses' && method === 'GET') {
      if (!query.patientId) return fail(400, 'لازم تحدد المريض');
      if (!canAccess(user, query.patientId)) return fail(403, 'مفيش صلاحية');
      var from = query.from ? normalizeDateTime(query.from.length === 10 ? query.from + ' 00:00:00' : query.from) : null;
      var to = query.to ? normalizeDateTime(query.to.length === 10 ? query.to + ' 23:59:59' : query.to) : null;
      var dl = db.doses.filter(function (d) {
        return d.patient_id === Number(query.patientId) && (!from || d.scheduled_at >= from) && (!to || d.scheduled_at <= to);
      });
      return ok({
        doses: sortBy(dl, 'scheduled_at', -1).slice(0, 200).map(function (d) {
          return Object.assign({}, d, { name: (medOf(d.medication_id) || {}).name });
        }),
      });
    }

    /* --- المواعيد --- */
    if (path === '/appointments' && method === 'GET') {
      if (!query.patientId) return fail(400, 'لازم تحدد المريض');
      if (!canAccess(user, query.patientId)) return fail(403, 'مفيش صلاحية');
      return ok({
        appointments: sortBy(
          db.appts.filter(function (a) {
            return a.patient_id === Number(query.patientId);
          }),
          'appointment_at', 1
        ),
      });
    }
    if (path === '/appointments' && method === 'POST') {
      if (!body.patientId) return fail(400, 'لازم تحدد المريض');
      if (!body.title || !String(body.title).trim()) return fail(400, 'من فضلك اكتب عنوان الموعد');
      var when = normalizeDateTime(body.appointmentAt);
      if (!when) return fail(400, 'وقت الموعد مش مكتوب صح');
      if (!canAccess(user, body.patientId)) return fail(403, 'مفيش صلاحية');
      var ap = { id: nextId('appt'), patient_id: Number(body.patientId), title: String(body.title).trim(),
        doctor_name: body.doctorName || null, location: body.location || null, appointment_at: when,
        notes: body.notes || null, created_at: nowStr() };
      db.appts.push(ap);
      save();
      return ok({ id: ap.id }, 201);
    }
    if ((m = /^\/appointments\/(\d+)$/.exec(path)) && (method === 'PUT' || method === 'DELETE')) {
      var apt = db.appts.find(function (a) {
        return a.id === Number(m[1]);
      });
      if (!apt) return fail(404, 'الموعد مش موجود');
      if (!canAccess(user, apt.patient_id)) return fail(403, 'مفيش صلاحية');
      if (method === 'DELETE') {
        db.appts = db.appts.filter(function (a) {
          return a.id !== apt.id;
        });
        save();
        return ok({ ok: true });
      }
      if (body.title !== undefined) {
        if (!String(body.title).trim()) return fail(400, 'من فضلك اكتب عنوان الموعد');
        apt.title = String(body.title).trim();
      }
      if (body.appointmentAt !== undefined) {
        var w2 = normalizeDateTime(body.appointmentAt);
        if (!w2) return fail(400, 'وقت الموعد مش مكتوب صح');
        apt.appointment_at = w2;
      }
      if (body.doctorName !== undefined) apt.doctor_name = body.doctorName || null;
      if (body.location !== undefined) apt.location = body.location || null;
      if (body.notes !== undefined) apt.notes = body.notes || null;
      save();
      return ok({ ok: true });
    }

    /* --- القياسات --- */
    if (path === '/vitals' && method === 'GET') {
      if (!query.patientId) return fail(400, 'لازم تحدد المريض');
      if (query.type && VITAL_TYPES.indexOf(query.type) === -1) return fail(400, 'نوع القياس غير معروف');
      if (!canAccess(user, query.patientId)) return fail(403, 'مفيش صلاحية');
      var vs = db.vitals.filter(function (v) {
        return v.patient_id === Number(query.patientId) && (!query.type || v.type === query.type);
      });
      return ok({ vitals: sortBy(vs, 'recorded_at', -1).slice(0, 100) });
    }
    if (path === '/vitals' && method === 'POST') {
      if (!body.patientId || !body.type || !body.value) return fail(400, 'من فضلك املأ كل البيانات');
      if (VITAL_TYPES.indexOf(body.type) === -1) return fail(400, 'نوع القياس غير معروف');
      var verr = validateVital(body.type, body.value);
      if (verr) return fail(400, verr);
      var rec = body.recordedAt ? normalizeDateTime(body.recordedAt) : nowStr();
      if (!rec) return fail(400, 'وقت القياس مش مكتوب صح');
      if (!canAccess(user, body.patientId)) return fail(403, 'مفيش صلاحية');
      var vr = { id: nextId('vital'), patient_id: Number(body.patientId), type: body.type, value_json: body.value,
        recorded_at: rec, created_at: nowStr() };
      db.vitals.push(vr);
      var alert = describeCritical(body.type, body.value);
      if (alert) {
        var vp = userOf(vr.patient_id);
        caregiverIds(vr.patient_id).forEach(function (cid) {
          addNotif(cid, vr.patient_id, 'patient_issue', 'critical',
            'قراءة محتاجة انتباه لـ ' + (vp ? vp.name : 'المريض') + ' - ' + alert + ' (الساعة ' + clockLabel(rec) + ')', vr.id);
        });
      }
      save();
      return ok({ id: vr.id, alert: alert || null }, 201);
    }
    if ((m = /^\/vitals\/(\d+)$/.exec(path)) && method === 'DELETE') {
      var vd = db.vitals.find(function (v) {
        return v.id === Number(m[1]);
      });
      if (!vd) return fail(404, 'القياس مش موجود');
      if (!canAccess(user, vd.patient_id)) return fail(403, 'مفيش صلاحية');
      db.vitals = db.vitals.filter(function (v) {
        return v.id !== vd.id;
      });
      save();
      return ok({ ok: true });
    }

    /* --- الإشعارات --- */
    if (path === '/notifications' && method === 'GET') {
      var since = Number(query.since);
      var limit = Math.min(Number(query.limit) || 50, 100);
      var all = db.notifs.filter(function (n) {
        return n.user_id === user.id;
      });
      var rowsN = all
        .filter(function (n) {
          return !(Number.isInteger(since) && since > 0) || n.id > since;
        })
        .sort(function (a, b) {
          return b.id - a.id;
        })
        .slice(0, limit);
      var unread = all.filter(function (n) {
        return !n.is_read;
      });
      return ok({
        notifications: rowsN,
        unread_count: unread.length,
        critical_count: unread.filter(function (n) {
          return n.priority === 'critical' && !n.handled_at;
        }).length,
        latest_id: all.reduce(function (mx, n) {
          return Math.max(mx, n.id);
        }, 0),
      });
    }
    if (path === '/notifications/read-all' && method === 'POST') {
      db.notifs.forEach(function (n) {
        if (n.user_id === user.id) n.is_read = 1;
      });
      save();
      return ok({ ok: true });
    }
    if ((m = /^\/notifications\/(\d+)\/(read|handled)$/.exec(path)) && method === 'POST') {
      var nt = db.notifs.find(function (n) {
        return n.id === Number(m[1]) && n.user_id === user.id;
      });
      if (!nt) return fail(404, 'الإشعار مش موجود');
      nt.is_read = 1;
      if (m[2] === 'handled' && !nt.handled_at) nt.handled_at = nowStr();
      save();
      return ok({ ok: true });
    }
    if (path === '/notifications/prefs' && method === 'GET') return ok({ prefs: getPrefs(user.id) });
    if (path === '/notifications/prefs' && method === 'PUT') {
      var cur = getPrefs(user.id);
      var keys = ['push_enabled', 'pref_dose_due', 'pref_missed_dose', 'pref_appointment', 'pref_patient_issue'];
      keys.forEach(function (k) {
        if (body[k] !== undefined) cur[k] = body[k] ? 1 : 0;
      });
      var qs = body.quiet_start !== undefined ? body.quiet_start : cur.quiet_start;
      var qe = body.quiet_end !== undefined ? body.quiet_end : cur.quiet_end;
      if ((qs && !qe) || (!qs && qe)) return fail(400, 'لازم تحدد بداية ونهاية ساعات الهدوء');
      cur.quiet_start = qs || null;
      cur.quiet_end = qe || null;
      db.prefs[user.id] = cur;
      save();
      return ok({ ok: true, prefs: cur });
    }

    /* --- الدفع: مفيش سيرفر دفع في النسخة التجريبية --- */
    if (path === '/push/subscribe' || path === '/push/unsubscribe') return ok({ ok: true });
    if (path === '/push/devices' && method === 'GET') return ok({ devices: [] });
    if (path === '/push/test' && method === 'POST') {
      return fail(503, 'ده عرض تجريبي - التنبيهات الحقيقية محتاجة سيرفر شغّال');
    }

    return fail(404, 'المسار ده مش موجود في النسخة التجريبية');
  }

  function getPrefs(userId) {
    return Object.assign(
      { user_id: userId, push_enabled: 1, quiet_start: null, quiet_end: null, pref_dose_due: 1,
        pref_missed_dose: 1, pref_appointment: 1, pref_patient_issue: 1 },
      db.prefs[userId] || {}
    );
  }

  function caregiverPatients(caregiverId) {
    return db.links
      .filter(function (l) {
        return l.caregiver_id === caregiverId;
      })
      .map(function (l) {
        return userOf(l.patient_id);
      })
      .filter(Boolean);
  }

  function doseAction(user, doseId, action) {
    var d = db.doses.find(function (x) {
      return x.id === doseId;
    });
    if (!d) return fail(404, 'الجرعة مش موجودة');
    if (!canAccess(user, d.patient_id)) return fail(403, 'مفيش صلاحية');
    var med = medOf(d.medication_id) || {};
    var nowMs = strToMs(nowStr());
    var sched = strToMs(d.scheduled_at);

    if (action === 'take') {
      if (d.status === 'taken') return fail(409, 'الجرعة دي اتسجلت قبل كده');
      if (nowMs < sched - DOSE_EARLY_MINUTES * 60000) return fail(403, 'لسه بدري على الجرعة دي');
      if (nowMs > sched + DOSE_LATE_TAKE_HOURS * 3600000) return fail(403, 'عدى وقت طويل على الجرعة دي - مينفعش تتسجل');
      var late = d.status === 'missed';
      d.status = 'taken';
      d.taken_at = nowStr();
      d.snooze_until = null;
      if (med.pills_left !== null && med.pills_left !== undefined && med.pills_left > 0) med.pills_left -= 1;
      save();
      return ok({ ok: true, late: late, medName: med.name });
    }

    if (d.status !== 'pending') return fail(409, 'الجرعة دي مبقتش معلّقة');
    if (med.is_critical || med.snooze_allowed === 0) return fail(403, 'الدوا ده مينفعش يتأجل - توقيته مهم');
    if (d.snooze_count >= MAX_SNOOZES) return fail(429, 'وصلت للحد الأقصى من التأجيل لجرعة دي');
    var until = msToStr(nowMs + SNOOZE_MINUTES * 60000);
    d.snooze_until = until;
    d.snooze_count += 1;
    d.reminder_notified_at = null;
    save();
    return ok({ ok: true, snooze_until: until, snooze_count: d.snooze_count, snoozes_left: MAX_SNOOZES - d.snooze_count, minutes: SNOOZE_MINUTES });
  }

  function patientRoute(method, patientId, sub, query, body, user) {
    var patient = userOf(patientId);
    if (!patient || patient.role !== 'patient') return fail(404, 'المريض مش موجود');
    if (!canAccess(user, patientId)) return fail(403, 'مفيش صلاحية');
    var m;

    if (sub === '' && method === 'DELETE') {
      if (user.role !== 'caregiver') return fail(403, 'المتابعين بس');
      if (caregiverIds(patientId).length > 1) return fail(409, 'فيه متابعين تانيين على المريض ده - اخرج من المتابعة بدل الحذف');
      removePatient(patientId);
      save();
      return ok({ ok: true });
    }

    if (sub === 'link' && method === 'DELETE') {
      if (caregiverIds(patientId).length <= 1) return fail(409, 'انت آخر متابع للمريض ده - مينفعش تخرج وتسيبه من غير حد');
      db.links = db.links.filter(function (l) {
        return !(l.patient_id === patientId && l.caregiver_id === user.id);
      });
      save();
      return ok({ ok: true });
    }

    if (sub === 'regenerate-link' && method === 'POST') {
      if (user.role !== 'caregiver') return fail(403, 'المتابعين بس');
      patient.access_token = randomCode(24, 'abcdefghijklmnopqrstuvwxyz0123456789');
      save();
      return ok({ access_token: patient.access_token });
    }

    if (sub === 'caregivers' && method === 'GET') {
      return ok({
        caregivers: caregiverIds(patientId).map(function (cid) {
          var c = userOf(cid);
          return { id: c.id, name: c.name };
        }),
      });
    }

    if ((m = /^caregivers\/(\d+)$/.exec(sub)) && method === 'DELETE') {
      if (user.role !== 'caregiver') return fail(403, 'المتابعين بس');
      if (Number(m[1]) === user.id) return fail(400, 'مينفعش تشيل نفسك من هنا');
      if (caregiverIds(patientId).length <= 1) return fail(409, 'ده آخر متابع - مينفعش يتشال');
      db.links = db.links.filter(function (l) {
        return !(l.patient_id === patientId && l.caregiver_id === Number(m[1]));
      });
      save();
      return ok({ ok: true });
    }

    if (sub === 'report-issue' && method === 'POST') {
      if (user.role !== 'patient') return fail(403, 'البلاغ ده بيتبعت من المريض نفسه بس');
      var issue = ISSUES[body.issueType];
      if (!issue) return fail(400, 'نوع المشكلة غير معروف');
      var msg =
        body.issueType === 'med_finished' && body.medicationName
          ? patient.name + ' بلّغ إن دوا "' + String(body.medicationName).trim() + '" خلص وعايز عبوة جديدة'
          : patient.name + ' بلّغ: ' + issue.label;
      var ids = caregiverIds(patientId);
      ids.forEach(function (cid) {
        addNotif(cid, patientId, 'patient_issue', issue.urgent ? 'critical' : 'normal', msg, null);
      });
      save();
      return ok({ ok: true, notified: ids.length }, 201);
    }

    if (sub === 'notification-status' && method === 'GET') {
      // النسخة التجريبية مفيهاش أجهزة حقيقية - بنعرض الحالة "سليمة" عشان الواجهة تتشاف كاملة
      return ok({
        serverPushEnabled: true,
        deviceCount: 1,
        devices: [{ id: 1, user_agent: 'جهاز تجريبي', last_success_at: nowStr(), created_at: nowStr() }],
        pushEnabledByUser: Boolean(getPrefs(patientId).push_enabled),
        lastDeliveredAt: nowStr(),
        ok: true,
      });
    }

    if (sub === 'test-alarm' && method === 'POST') return ok({ ok: true, sent: 1 });

    if (sub === 'adherence' && method === 'GET') return ok(adherence(patientId, Number(query.days)));

    return fail(404, 'المسار ده مش موجود في النسخة التجريبية');
  }

  function removePatient(patientId) {
    var medIds = db.meds
      .filter(function (x) {
        return x.patient_id === patientId;
      })
      .map(function (x) {
        return x.id;
      });
    db.users = db.users.filter(function (u) {
      return u.id !== patientId;
    });
    db.links = db.links.filter(function (l) {
      return l.patient_id !== patientId;
    });
    db.meds = db.meds.filter(function (x) {
      return x.patient_id !== patientId;
    });
    db.doses = db.doses.filter(function (d) {
      return d.patient_id !== patientId;
    });
    db.appts = db.appts.filter(function (a) {
      return a.patient_id !== patientId;
    });
    db.vitals = db.vitals.filter(function (v) {
      return v.patient_id !== patientId;
    });
    db.notifs = db.notifs.filter(function (n) {
      return n.patient_id !== patientId && n.user_id !== patientId;
    });
    medIds.forEach(function (id) {
      delete db.images[id];
    });
  }

  function adherence(patientId, daysParam) {
    var days = Math.min(Math.max(daysParam || 30, 1), 90);
    var from = addDays(today(), -(days - 1)) + ' 00:00:00';
    var to = today() + ' 23:59:59';
    var rows = db.doses.filter(function (d) {
      return d.patient_id === patientId && d.scheduled_at >= from && d.scheduled_at <= to;
    });
    var counted = rows.filter(function (d) {
      return d.status !== 'pending';
    });
    var taken = counted.filter(function (d) {
      return d.status === 'taken';
    }).length;
    var missed = counted.length - taken;

    function bucket(map, key, init, status) {
      if (!map[key]) map[key] = init;
      map[key][status === 'taken' ? 'taken' : 'missed'] += 1;
    }
    var byDay = {};
    var byMed = {};
    var byTime = {};
    counted.forEach(function (d) {
      bucket(byDay, d.scheduled_at.slice(0, 10), { day: d.scheduled_at.slice(0, 10), taken: 0, missed: 0 }, d.status);
      var med = medOf(d.medication_id) || {};
      bucket(byMed, d.medication_id, { id: d.medication_id, name: med.name, taken: 0, missed: 0 }, d.status);
      var clock = d.scheduled_at.slice(11, 16);
      bucket(byTime, clock, { time: clock, label: clockLabel(d.scheduled_at), taken: 0, missed: 0 }, d.status);
    });
    var timesArr = Object.keys(byTime)
      .sort()
      .map(function (k) {
        return byTime[k];
      });
    var worst =
      timesArr
        .filter(function (x) {
          return x.missed >= 2;
        })
        .sort(function (a, b) {
          return b.missed - a.missed;
        })[0] || null;

    return {
      days: days, from: from.slice(0, 10), to: to.slice(0, 10), total: counted.length, taken: taken, missed: missed,
      rate: counted.length ? Math.round((taken / counted.length) * 100) : null,
      pendingNotCounted: rows.length - counted.length,
      byDay: Object.keys(byDay).sort().map(function (k) { return byDay[k]; }),
      byMedication: Object.keys(byMed).map(function (k) { return byMed[k]; }).sort(function (a, b) { return b.missed - a.missed; }),
      byTime: timesArr,
      worstTime: worst,
    };
  }

  /* ---------- اعتراض fetch ---------- */

  db = load();
  if (!db) seed();

  var realFetch = window.fetch.bind(window);

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : input && input.url;
    var parsed;
    try {
      parsed = new URL(url, window.location.origin);
    } catch (e) {
      return realFetch(input, init);
    }
    if (parsed.origin !== window.location.origin || parsed.pathname.indexOf('/api/') !== 0) {
      return realFetch(input, init);
    }

    var method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    var headers = (init && init.headers) || {};
    var body = null;
    if (init && init.body) {
      try {
        body = JSON.parse(init.body);
      } catch (e) {
        body = null;
      }
    }
    var query = {};
    parsed.searchParams.forEach(function (v, k) {
      query[k] = v;
    });

    var result;
    try {
      tick();
      result = route(method, parsed.pathname.slice(4), query, body, userFromAuth(headers));
    } catch (e) {
      result = fail(500, 'حصل خطأ في النسخة التجريبية');
      if (window.console) console.error('[ma3ak-demo]', e);
    }

    // تأخير بسيط عشان حالات التحميل في الواجهة تبان زي الحقيقية
    return new Promise(function (resolve) {
      setTimeout(function () {
        resolve(
          new Response(JSON.stringify(result.body), {
            status: result.status,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      }, 60 + Math.floor(Math.random() * 90));
    });
  };

  /* ---------- شريط التجربة (تبديل الدور / منبه تجريبي / إعادة ضبط) ---------- */

  function setSession(userId, accessToken) {
    try {
      localStorage.setItem('ma3ak_token', 'demo.' + userId + '.' + randomCode(10, 'abcdefghijklmnopqrstuvwxyz0123456789'));
      if (accessToken) localStorage.setItem('ma3ak_access', accessToken);
      else localStorage.removeItem('ma3ak_access');
    } catch (e) {
      /* مفيش تخزين - مفيش جلسة نبدّلها */
    }
    window.location.href = '/';
  }

  // بيحط جرعة معلّقة ميعادها "دلوقتي" عشان الزائر يشوف شاشة المنبه فعلاً
  function triggerAlarm() {
    var med = db.meds.find(function (x) {
      return x.patient_id === 2 && x.active && !x.is_critical;
    });
    if (!med) return;
    var at = nowStr().slice(0, 16) + ':00';
    var existing = db.doses.find(function (d) {
      return d.medication_id === med.id && d.scheduled_at === at;
    });
    if (!existing) {
      db.doses.push({
        id: nextId('dose'), medication_id: med.id, patient_id: 2, scheduled_at: at, status: 'pending',
        snooze_until: null, snooze_count: 0, snooze_notified_at: null, taken_at: null,
        due_notified_at: null, reminder_notified_at: null, escalated_at: null,
      });
    } else {
      existing.status = 'pending';
      existing.taken_at = null;
    }
    save();
    setSession(2, 'DEMOHAJMOHAMED');
  }

  function resetDemo() {
    try {
      localStorage.removeItem(DB_KEY);
      localStorage.removeItem('ma3ak_token');
      localStorage.removeItem('ma3ak_access');
    } catch (e) {
      /* لا شيء */
    }
    window.location.href = '/';
  }

  /* زرار العرض التجريبي: نفس الشكل بالظبط في كل مشاريع العرض (كبسولة عايمة
     بنقطة صفراء + لوحة منسدلة)، عشان الزائر يلاقي نفس الحاجة في أي مشروع. */
  function mountBar() {
    if (document.getElementById('demo-bar')) return;
    var style = document.createElement('style');
    style.textContent =
      '#demo-bar{position:fixed;left:10px;bottom:10px;z-index:2147483000;font-family:inherit;direction:rtl;font-size:13px;line-height:1.5}' +
      '#demo-bar *{box-sizing:border-box}' +
      '#demo-toggle{display:flex;align-items:center;gap:6px;background:#1c1c24;color:#fff;border:1px solid rgba(255,255,255,.28);' +
      'border-radius:999px;padding:7px 13px;font:inherit;font-weight:700;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.35)}' +
      '#demo-toggle i{width:8px;height:8px;border-radius:50%;background:#f5b93a;display:inline-block}' +
      '#demo-panel{display:none;position:absolute;left:0;bottom:calc(100% + 8px);width:min(290px,calc(100vw - 20px));' +
      'background:#fff;color:#1c1c24;border:1px solid #d6d6dc;border-radius:14px;padding:12px;box-shadow:0 12px 32px rgba(0,0,0,.3)}' +
      '#demo-panel p{margin:0 0 8px;font-size:12.5px;color:#454552}' +
      '#demo-panel button{display:block;width:100%;margin-top:6px;padding:9px 11px;border-radius:10px;border:1px solid #1c1c24;' +
      'background:#fff;color:#1c1c24;font:inherit;font-weight:700;text-align:right;cursor:pointer}' +
      '#demo-panel button.primary{background:#1c1c24;color:#fff}' +
      '#demo-panel small{display:block;margin-top:9px;font-size:11.5px;color:#6a6a78}' +
      // على الموبايل في شريط تنقّل سفلي (وشريط "حصلت مشكلة؟" عند المريض): نرفع الكبسولة فوقهم
      '@media (max-width:760px){#demo-bar{bottom:96px}}';
    document.head.appendChild(style);

    var wrap = document.createElement('div');
    wrap.id = 'demo-bar';
    wrap.innerHTML =
      '<div id="demo-panel" role="dialog" aria-label="خيارات النسخة التجريبية">' +
      '<p>ده عرض لتطبيق معاك ببيانات وهمية متخزنة على جهازك بس.</p>' +
      '<button type="button" class="primary" data-act="caregiver">ادخل كمتابع (منى)</button>' +
      '<button type="button" data-act="patient">ادخل كمريض (الحاج محمد)</button>' +
      '<button type="button" data-act="alarm">جرّب منبه الجرعة دلوقتي</button>' +
      '<button type="button" data-act="reset">إعادة ضبط البيانات</button>' +
      '<small>أو سجّل دخول بـ 01000000001 وكلمة المرور 123456. التنبيهات الحقيقية (والتطبيق مقفول) محتاجة سيرفر شغّال - مش متاحة في العرض ده.</small>' +
      '</div>' +
      '<button id="demo-toggle" type="button" aria-expanded="false" aria-controls="demo-panel"><i></i><span>نسخة تجريبية</span></button>';
    document.body.appendChild(wrap);

    var toggle = document.getElementById('demo-toggle');
    var panel = document.getElementById('demo-panel');
    function setOpen(open) {
      panel.style.display = open ? 'block' : 'none';
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    toggle.addEventListener('click', function () {
      setOpen(panel.style.display !== 'block');
    });
    panel.addEventListener('click', function (e) {
      var act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'caregiver') setSession(1, null);
      else if (act === 'patient') setSession(2, 'DEMOHAJMOHAMED');
      else if (act === 'alarm') triggerAlarm();
      else if (act === 'reset') resetDemo();
    });
    try {
      if (!sessionStorage.getItem('ma3ak_demo_seen')) {
        sessionStorage.setItem('ma3ak_demo_seen', '1');
        setOpen(true);
      }
    } catch (e) {
      /* لا شيء */
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountBar);
  else mountBar();
})();
