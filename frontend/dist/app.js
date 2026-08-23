/* معاك (MA3ak) - ملف مبني تلقائيًا من frontend/build.js - متعدّلش فيه */
(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
  var __objRest = (source, exclude) => {
    var target = {};
    for (var prop in source)
      if (__hasOwnProp.call(source, prop) && exclude.indexOf(prop) < 0)
        target[prop] = source[prop];
    if (source != null && __getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(source)) {
        if (exclude.indexOf(prop) < 0 && __propIsEnum.call(source, prop))
          target[prop] = source[prop];
      }
    return target;
  };
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var require_stdin = __commonJS({
    "<stdin>"(exports, module) {
      /*! ===== js/api.js ===== */
      const API_BASE = "/api";
      function getToken() {
        return localStorage.getItem("ma3ak_token");
      }
      function setToken(token) {
        if (token) localStorage.setItem("ma3ak_token", token);
        else localStorage.removeItem("ma3ak_token");
      }
      async function apiRequest(path, { method = "GET", body } = {}) {
        const headers = { "Content-Type": "application/json" };
        const token = getToken();
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(API_BASE + path, {
          method,
          headers,
          body: body ? JSON.stringify(body) : void 0
        });
        let data = null;
        try {
          data = await res.json();
        } catch (e) {
        }
        if (!res.ok) {
          const message = data && data.error || "حصل خطأ غير متوقع";
          throw new Error(message);
        }
        return data;
      }
      const api = {
        register: (payload) => apiRequest("/auth/register", { method: "POST", body: payload }),
        login: (identifier, password) => apiRequest("/auth/login", { method: "POST", body: { identifier, password } }),
        accessViaToken: (token) => apiRequest("/auth/access", { method: "POST", body: { token } }),
        me: () => apiRequest("/auth/me"),
        createPatient: (payload) => apiRequest("/patients", { method: "POST", body: payload }),
        linkPatient: (code) => apiRequest("/patients/link", { method: "POST", body: { code } }),
        regeneratePatientLink: (id) => apiRequest(`/patients/${id}/regenerate-link`, { method: "POST" }),
        reportIssue: (patientId, issueType, medicationName) => apiRequest(`/patients/${patientId}/report-issue`, {
          method: "POST",
          body: { issueType, medicationName }
        }),
        getPatients: () => apiRequest("/patients"),
        getCaregivers: (patientId) => apiRequest(`/patients/${patientId}/caregivers`),
        getMedications: (patientId) => apiRequest(`/medications?patientId=${patientId}`),
        getTodayDoses: (patientId) => apiRequest(`/medications/${patientId}/today`),
        addMedication: (payload) => apiRequest("/medications", { method: "POST", body: payload }),
        updateMedication: (id, payload) => apiRequest(`/medications/${id}`, { method: "PUT", body: payload }),
        deleteMedication: (id) => apiRequest(`/medications/${id}`, { method: "DELETE" }),
        takeDose: (id) => apiRequest(`/doses/${id}/take`, { method: "POST" }),
        getAppointments: (patientId) => apiRequest(`/appointments?patientId=${patientId}`),
        addAppointment: (payload) => apiRequest("/appointments", { method: "POST", body: payload }),
        updateAppointment: (id, payload) => apiRequest(`/appointments/${id}`, { method: "PUT", body: payload }),
        deleteAppointment: (id) => apiRequest(`/appointments/${id}`, { method: "DELETE" }),
        getVitals: (patientId, type) => apiRequest(`/vitals?patientId=${patientId}${type ? `&type=${type}` : ""}`),
        addVital: (payload) => apiRequest("/vitals", { method: "POST", body: payload }),
        deleteVital: (id) => apiRequest(`/vitals/${id}`, { method: "DELETE" }),
        getNotifications: () => apiRequest("/notifications"),
        markNotificationRead: (id) => apiRequest(`/notifications/${id}/read`, { method: "POST" }),
        markAllNotificationsRead: () => apiRequest("/notifications/read-all", { method: "POST" })
      };
      /*! ===== js/doseLogic.js ===== */
      const DOSE_EARLY_MINUTES = 15;
      const CAIRO_TZ = "Africa/Cairo";
      function parseCairoDatetime(scheduledAt) {
        const [datePart, timePart] = String(scheduledAt).trim().split(/[ T]/);
        const [year, month, day] = datePart.split("-").map(Number);
        const [hour, minute, second] = (timePart || "00:00:00").split(":").map(Number);
        const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second || 0);
        const offsetMinutes = cairoOffsetMinutesAt(new Date(utcGuess));
        return new Date(utcGuess - offsetMinutes * 6e4);
      }
      function cairoOffsetMinutesAt(date) {
        const parts = new Intl.DateTimeFormat("en-US", {
          timeZone: CAIRO_TZ,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false
        }).formatToParts(date);
        const get = (type) => Number(parts.find((p) => p.type === type).value);
        let hour = get("hour");
        if (hour === 24) hour = 0;
        const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
        return Math.round((asIfUtc - date.getTime()) / 6e4);
      }
      function getDoseAvailability(scheduledAt, now) {
        const scheduled = parseCairoDatetime(scheduledAt);
        const availableFrom = new Date(scheduled.getTime() - DOSE_EARLY_MINUTES * 6e4);
        return { availableFrom, isEarly: now < availableFrom };
      }
      if (typeof module !== "undefined" && module.exports) {
        module.exports = { DOSE_EARLY_MINUTES, getDoseAvailability, parseCairoDatetime, cairoOffsetMinutesAt };
      }
      /*! ===== js/icons.jsx ===== */
      const ICON_PATHS = {
        /* ---------- الهوية ---------- */
        // شعار معاك: قلب + خط نبض جواه (رعاية + متابعة صحية)
        brand: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M12 20.8 4.4 13.3a5 5 0 1 1 7.6-6.4 5 5 0 1 1 7.6 6.4Z" }), /* @__PURE__ */ React.createElement("path", { d: "M4.6 12.4h3.1l1.6-3 2.2 5.6 1.7-3.3 1 .7h5.2" })),
        /* ---------- التنقّل ---------- */
        home: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M3.6 10.4 12 3.5l8.4 6.9V19.6a1.8 1.8 0 0 1-1.8 1.8H5.4a1.8 1.8 0 0 1-1.8-1.8Z" }), /* @__PURE__ */ React.createElement("path", { d: "M9.4 21.4v-6.6h5.2v6.6" })),
        pill: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("rect", { x: "1.9", y: "8.4", width: "20.2", height: "7.2", rx: "3.6", transform: "rotate(-45 12 12)" }), /* @__PURE__ */ React.createElement("path", { d: "M9.5 9.5 14.5 14.5" })),
        calendar: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("rect", { x: "3.2", y: "5", width: "17.6", height: "16", rx: "3.2" }), /* @__PURE__ */ React.createElement("path", { d: "M3.2 10.2h17.6M8.2 2.8v4.2M15.8 2.8v4.2" }), /* @__PURE__ */ React.createElement("circle", { cx: "8.4", cy: "14.4", r: "1.15", fill: "currentColor", stroke: "none" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "14.4", r: "1.15", fill: "currentColor", stroke: "none" }), /* @__PURE__ */ React.createElement("circle", { cx: "15.6", cy: "14.4", r: "1.15", fill: "currentColor", stroke: "none" })),
        stethoscope: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M6.6 3.4v5.5a4.6 4.6 0 0 0 9.2 0V3.4" }), /* @__PURE__ */ React.createElement("path", { d: "M4.9 3.4h3.1M14.4 3.4h3.1" }), /* @__PURE__ */ React.createElement("path", { d: "M11.2 13.5v2.2a4.6 4.6 0 0 0 9.2 0v-1.3" }), /* @__PURE__ */ React.createElement("circle", { cx: "20.4", cy: "11.7", r: "2.4" })),
        bell: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M18.2 8.6a6.2 6.2 0 1 0-12.4 0c0 5.3-2.1 6.6-2.1 6.6h16.6s-2.1-1.3-2.1-6.6Z" }), /* @__PURE__ */ React.createElement("path", { d: "M13.9 19a2.2 2.2 0 0 1-3.8 0" })),
        bellOff: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M17.6 8.6a6.2 6.2 0 0 0-9.4-4.1M5.9 8.9c0 4.9-2.2 6.3-2.2 6.3h13.4" }), /* @__PURE__ */ React.createElement("path", { d: "M13.9 19a2.2 2.2 0 0 1-3.8 0" }), /* @__PURE__ */ React.createElement("path", { d: "M3.4 3.4 20.6 20.6" })),
        users: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "9.2", cy: "8.2", r: "3.7" }), /* @__PURE__ */ React.createElement("path", { d: "M2.8 20.2a6.4 6.4 0 0 1 12.8 0" }), /* @__PURE__ */ React.createElement("path", { d: "M16.6 5.1a3.7 3.7 0 0 1 0 6.6M18.2 14.6a6.4 6.4 0 0 1 3 5.6" })),
        user: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "8", r: "4.1" }), /* @__PURE__ */ React.createElement("path", { d: "M4.4 20.6a7.6 7.6 0 0 1 15.2 0" })),
        /* ---------- إجراءات ---------- */
        settings: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "3" })),
        // السهم بيخرج ناحية الشمال - في واجهة عربية (RTL) الخروج بيتقرا للشمال
        logout: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M14.8 20.6h3.4a2 2 0 0 0 2-2V5.4a2 2 0 0 0-2-2h-3.4" }), /* @__PURE__ */ React.createElement("path", { d: "M8.4 7.8 4.2 12l4.2 4.2" }), /* @__PURE__ */ React.createElement("path", { d: "M4.2 12h10.6" })),
        plus: /* @__PURE__ */ React.createElement("path", { d: "M12 4.8v14.4M4.8 12h14.4" }),
        trash: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M3.8 6.4h16.4" }), /* @__PURE__ */ React.createElement("path", { d: "M9.2 6.4V4.9a1.4 1.4 0 0 1 1.4-1.4h2.8a1.4 1.4 0 0 1 1.4 1.4v1.5" }), /* @__PURE__ */ React.createElement("path", { d: "M6.2 6.4l.85 12.9a1.7 1.7 0 0 0 1.7 1.6h6.5a1.7 1.7 0 0 0 1.7-1.6l.85-12.9" }), /* @__PURE__ */ React.createElement("path", { d: "M10.2 10.6v6.2M13.8 10.6v6.2" })),
        link: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M10.2 13.8a4.5 4.5 0 0 0 6.8.5l2.4-2.4a4.5 4.5 0 0 0-6.4-6.4l-1.4 1.4" }), /* @__PURE__ */ React.createElement("path", { d: "M13.8 10.2a4.5 4.5 0 0 0-6.8-.5L4.6 12.1a4.5 4.5 0 0 0 6.4 6.4l1.4-1.4" })),
        refresh: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M20.6 12a8.6 8.6 0 1 1-2.5-6.1" }), /* @__PURE__ */ React.createElement("path", { d: "M20.6 3.6v5.7h-5.7" })),
        copy: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("rect", { x: "8.8", y: "8.8", width: "12.4", height: "12.4", rx: "2.6" }), /* @__PURE__ */ React.createElement("path", { d: "M5.6 15.2H4.8a2 2 0 0 1-2-2V4.8a2 2 0 0 1 2-2h8.4a2 2 0 0 1 2 2v.8" })),
        speaker: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M11.4 4.6 6.8 8.4H3.9a1.2 1.2 0 0 0-1.2 1.2v4.8a1.2 1.2 0 0 0 1.2 1.2h2.9l4.6 3.8a.9.9 0 0 0 1.5-.7V5.3a.9.9 0 0 0-1.5-.7Z" }), /* @__PURE__ */ React.createElement("path", { d: "M16.4 9.2a4 4 0 0 1 0 5.6M19.2 6.4a8 8 0 0 1 0 11.2" })),
        share: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M12 15.4V3.4" }), /* @__PURE__ */ React.createElement("path", { d: "M8.4 7 12 3.4 15.6 7" }), /* @__PURE__ */ React.createElement("path", { d: "M5.6 13.2v5.8a2 2 0 0 0 2 2h8.8a2 2 0 0 0 2-2v-5.8" })),
        install: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("rect", { x: "5.6", y: "2.6", width: "12.8", height: "18.8", rx: "3" }), /* @__PURE__ */ React.createElement("path", { d: "M12 7.4v6.4M9.4 11.2 12 13.8l2.6-2.6" }), /* @__PURE__ */ React.createElement("path", { d: "M10.3 18.4h3.4" })),
        // إغلاق النوافذ. قبل كده كان الرمز النصي × - وده حرف بيترسم من الخط نفسه،
        // يعني سُمكه وميلانه بيختلفوا من جهاز للتاني ومبياخدش سُمك الخط بتاع باقي
        // الأيقونات، فكان بيبان أرفع وأصغر من كل حاجة حواليه.
        close: /* @__PURE__ */ React.createElement("path", { d: "M6.4 6.4 17.6 17.6M17.6 6.4 6.4 17.6" }),
        /* ---------- الحالات ---------- */
        check: /* @__PURE__ */ React.createElement("path", { d: "M4.6 12.6 9.6 17.6 19.4 6.8" }),
        checkCircle: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "8.8" }), /* @__PURE__ */ React.createElement("path", { d: "M8.1 12.3 10.9 15.1 16.2 9.2" })),
        alert: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "8.8" }), /* @__PURE__ */ React.createElement("path", { d: "M12 7.2v5.6" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "16.4", r: "1.15", fill: "currentColor", stroke: "none" })),
        warning: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M10.3 3.9 2.7 17.1a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" }), /* @__PURE__ */ React.createElement("path", { d: "M12 9.2v4.2" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "16.7", r: "1.1", fill: "currentColor", stroke: "none" })),
        clock: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "8.8" }), /* @__PURE__ */ React.createElement("path", { d: "M12 6.9V12l3.5 2.1" })),
        question: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "8.8" }), /* @__PURE__ */ React.createElement("path", { d: "M9.4 9.3a2.7 2.7 0 0 1 5.3.7c0 1.8-2.7 2.7-2.7 4" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "17", r: "1.1", fill: "currentColor", stroke: "none" })),
        unwell: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "8.8" }), /* @__PURE__ */ React.createElement("path", { d: "M8.5 15.8c.9-1.1 2.1-1.7 3.5-1.7s2.6.6 3.5 1.7" }), /* @__PURE__ */ React.createElement("path", { d: "M8 9.1l2.6 1.3M16 9.1l-2.6 1.3" })),
        phone: /* @__PURE__ */ React.createElement("path", { d: "M21.4 16.9v2.9a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 1.5 4.1 2 2 0 0 1 3.5 1.9h2.9a2 2 0 0 1 2 1.7 12.7 12.7 0 0 0 .7 2.8 2 2 0 0 1-.5 2.1L7.4 9.8a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5 12.7 12.7 0 0 0 2.8.7 2 2 0 0 1 1.8 2.1Z" }),
        inbox: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M5.7 5.2 2.9 12.4v4.6a2.2 2.2 0 0 0 2.2 2.2h13.8a2.2 2.2 0 0 0 2.2-2.2v-4.6l-2.8-7.2a2.2 2.2 0 0 0-2-1.4H7.7a2.2 2.2 0 0 0-2 1.4Z" }), /* @__PURE__ */ React.createElement("path", { d: "M2.9 12.4h4.5l1.4 2.6h6.4l1.4-2.6h4.5" })),
        sparkles: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M12 3.4 13.9 8.5 19 10.4 13.9 12.3 12 17.4 10.1 12.3 5 10.4 10.1 8.5Z" }), /* @__PURE__ */ React.createElement("path", { d: "M18.9 15.6v3M20.4 17.1h-3M5.4 3.6v2.8M6.8 5h-2.8" })),
        lock: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("rect", { x: "4.6", y: "10.3", width: "14.8", height: "10.8", rx: "2.6" }), /* @__PURE__ */ React.createElement("path", { d: "M8 10.3V7.2a4 4 0 0 1 8 0v3.1" })),
        /* ---------- القياسات الصحية ---------- */
        pulse: /* @__PURE__ */ React.createElement("path", { d: "M2.8 12.3h3.6l2.1-5.4 3.4 10.6 2.5-7.6 1.6 2.4h5.2" }),
        droplet: /* @__PURE__ */ React.createElement("path", { d: "M12 2.9s6.5 6.2 6.5 10.4A6.5 6.5 0 0 1 5.5 13.3C5.5 9.1 12 2.9 12 2.9Z" }),
        scale: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("rect", { x: "3.2", y: "3.8", width: "17.6", height: "16.4", rx: "3.4" }), /* @__PURE__ */ React.createElement("path", { d: "M8 14.8a4.6 4.6 0 0 1 8 0" }), /* @__PURE__ */ React.createElement("path", { d: "M12 14.8 14.1 10.3" })),
        heart: /* @__PURE__ */ React.createElement("path", { d: "M12 20.6 4.3 13a4.9 4.9 0 0 1 7.7-6.1 4.9 4.9 0 0 1 7.7 6.1Z" }),
        thermometer: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M14.2 14.6V5.1a2.2 2.2 0 0 0-4.4 0v9.5a4.3 4.3 0 1 0 4.4 0Z" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "17.6", r: "1.5", fill: "currentColor", stroke: "none" })),
        /* ---------- الإعدادات ---------- */
        sun: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "4.2" }), /* @__PURE__ */ React.createElement("path", { d: "M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6" })),
        moon: /* @__PURE__ */ React.createElement("path", { d: "M20.6 14.7A8.7 8.7 0 0 1 9.3 3.4 8.9 8.9 0 1 0 20.6 14.7Z" }),
        textSize: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M2.6 19.4 7.6 5.6l5 13.8M4.4 15.2h6.4" }), /* @__PURE__ */ React.createElement("path", { d: "M14.2 19.4 17.6 10.6 21 19.4M15.4 16.2h4.4" })),
        speech: /* @__PURE__ */ React.createElement("path", { d: "M21 11.7a8.4 8.4 0 0 1-12.1 7.5L3.4 20.6l1.4-5.2A8.4 8.4 0 1 1 21 11.7Z" })
      };
      function Icon({ name, size = 24, className = "", strokeWidth = 1.9, style }) {
        const paths = ICON_PATHS[name];
        if (!paths) return null;
        return /* @__PURE__ */ React.createElement(
          "svg",
          {
            className: className ? `icon ${className}` : "icon",
            width: size,
            height: size,
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth,
            strokeLinecap: "round",
            strokeLinejoin: "round",
            "aria-hidden": "true",
            focusable: "false",
            style
          },
          paths
        );
      }
      /*! ===== js/components/Common.jsx ===== */
      function Button(_a) {
        var _b = _a, { children, variant = "primary", loading = false, disabled = false } = _b, props = __objRest(_b, ["children", "variant", "loading", "disabled"]);
        return /* @__PURE__ */ React.createElement(
          "button",
          __spreadValues({
            className: `btn btn-${variant}${loading ? " is-loading" : ""}`,
            disabled: disabled || loading,
            "aria-busy": loading || void 0
          }, props),
          loading && /* @__PURE__ */ React.createElement("span", { className: "btn-spinner", "aria-hidden": "true" }),
          children
        );
      }
      function Card({ children, className = "" }) {
        return /* @__PURE__ */ React.createElement("div", { className: `card ${className}` }, children);
      }
      function Field({ label, children }) {
        return /* @__PURE__ */ React.createElement("label", { className: "field" }, /* @__PURE__ */ React.createElement("span", { className: "field-label" }, label), children);
      }
      function FieldGroup({ label, children }) {
        return /* @__PURE__ */ React.createElement("div", { className: "field" }, /* @__PURE__ */ React.createElement("span", { className: "field-label" }, label), children);
      }
      function Spinner() {
        return /* @__PURE__ */ React.createElement("div", { className: "spinner", role: "status", "aria-label": "جاري التحميل" });
      }
      function SkeletonCards({ count = 3 }) {
        return /* @__PURE__ */ React.createElement("div", { className: "skeleton-list", role: "status", "aria-label": "جاري التحميل" }, Array.from({ length: count }).map((_, i) => /* @__PURE__ */ React.createElement("div", { className: "skeleton-card", key: i, "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("div", { className: "skeleton skeleton-avatar" }), /* @__PURE__ */ React.createElement("div", { className: "skeleton-card-body" }, /* @__PURE__ */ React.createElement("div", { className: "skeleton skeleton-line" }), /* @__PURE__ */ React.createElement("div", { className: "skeleton skeleton-line" })))));
      }
      function EmptyState({ icon = "inbox", text }) {
        return /* @__PURE__ */ React.createElement("div", { className: "empty-state" }, /* @__PURE__ */ React.createElement("div", { className: "empty-icon" }, /* @__PURE__ */ React.createElement(Icon, { name: icon, size: 46, strokeWidth: 1.6 })), /* @__PURE__ */ React.createElement("p", null, text));
      }
      function Banner({ type = "error", children, onClose }) {
        if (!children) return null;
        return /* @__PURE__ */ React.createElement("div", { className: `banner banner-${type}`, role: "alert", "aria-live": type === "error" ? "assertive" : "polite" }, /* @__PURE__ */ React.createElement("span", null, children), onClose && /* @__PURE__ */ React.createElement("button", { className: "banner-close", onClick: onClose, "aria-label": "إغلاق" }, "×"));
      }
      const MODAL_FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
      const MODAL_EXIT_MS = 240;
      const MODAL_DRAG_CLOSE_PX = 110;
      const MODAL_DRAG_CLOSE_VELOCITY = 0.5;
      function prefersReducedMotion() {
        return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      }
      function Modal({
        title,
        subtitle,
        icon,
        tone = "primary",
        onClose,
        onSubmit,
        footer,
        children
      }) {
        const seq = React.useId();
        const titleId = `modal-title-${seq}`;
        const descId = `modal-desc-${seq}`;
        const overlayRef = React.useRef(null);
        const sheetRef = React.useRef(null);
        const bodyRef = React.useRef(null);
        const closingRef = React.useRef(false);
        const onCloseRef = React.useRef(onClose);
        onCloseRef.current = onClose;
        const requestClose = React.useCallback(function requestClose2() {
          if (closingRef.current) return;
          closingRef.current = true;
          if (prefersReducedMotion()) {
            onCloseRef.current();
            return;
          }
          if (overlayRef.current) overlayRef.current.classList.add("is-closing");
          setTimeout(() => onCloseRef.current(), MODAL_EXIT_MS);
        }, []);
        React.useEffect(() => {
          const returnTo = document.activeElement;
          if (sheetRef.current) sheetRef.current.focus();
          function onKeyDown(e) {
            if (e.key === "Escape") {
              e.stopPropagation();
              requestClose();
              return;
            }
            if (e.key !== "Tab" || !sheetRef.current) return;
            const items = Array.prototype.filter.call(
              sheetRef.current.querySelectorAll(MODAL_FOCUSABLE),
              (el) => el.offsetWidth > 0 || el.offsetHeight > 0
            );
            if (!items.length) return;
            const first = items[0];
            const last = items[items.length - 1];
            const active = document.activeElement;
            if (e.shiftKey && (active === first || active === sheetRef.current)) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && active === last) {
              e.preventDefault();
              first.focus();
            }
          }
          document.addEventListener("keydown", onKeyDown, true);
          const previousOverflow = document.body.style.overflow;
          document.body.style.overflow = "hidden";
          return () => {
            document.removeEventListener("keydown", onKeyDown, true);
            document.body.style.overflow = previousOverflow;
            if (returnTo && typeof returnTo.focus === "function" && document.contains(returnTo)) {
              returnTo.focus();
            }
          };
        }, [requestClose]);
        const [edges, setEdges] = React.useState({ top: true, bottom: true });
        const syncEdges = React.useCallback(() => {
          const el = bodyRef.current;
          if (!el) return;
          const atTop = el.scrollTop <= 1;
          const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
          setEdges((prev) => prev.top === atTop && prev.bottom === atBottom ? prev : { top: atTop, bottom: atBottom });
        }, []);
        React.useLayoutEffect(syncEdges);
        React.useLayoutEffect(() => {
          if (typeof ResizeObserver === "undefined" || !bodyRef.current) return;
          const ro = new ResizeObserver(syncEdges);
          ro.observe(bodyRef.current);
          return () => ro.disconnect();
        }, [syncEdges]);
        const drag = React.useRef({ active: false, startY: 0, dy: 0, startedAt: 0 });
        function isSheetMode() {
          return Boolean(window.matchMedia && window.matchMedia("(max-width: 639px)").matches);
        }
        function onDragStart(e) {
          if (closingRef.current || !isSheetMode() || e.touches.length !== 1) return;
          drag.current = { active: true, startY: e.touches[0].clientY, dy: 0, startedAt: Date.now() };
          if (sheetRef.current) sheetRef.current.style.transition = "none";
        }
        function onDragMove(e) {
          const d = drag.current;
          if (!d.active) return;
          const dy = Math.max(0, e.touches[0].clientY - d.startY);
          d.dy = dy;
          if (!sheetRef.current || !overlayRef.current) return;
          sheetRef.current.style.transform = `translate3d(0, ${dy}px, 0)`;
          overlayRef.current.style.setProperty("--drag-fade", String(Math.max(0.25, 1 - dy / 380)));
        }
        function onDragEnd() {
          const d = drag.current;
          if (!d.active) return;
          d.active = false;
          const velocity = d.dy / Math.max(1, Date.now() - d.startedAt);
          const shouldClose = d.dy > MODAL_DRAG_CLOSE_PX || velocity > MODAL_DRAG_CLOSE_VELOCITY;
          if (!shouldClose) {
            if (sheetRef.current) {
              sheetRef.current.style.transition = "";
              sheetRef.current.style.transform = "";
            }
            if (overlayRef.current) overlayRef.current.style.removeProperty("--drag-fade");
            return;
          }
          if (closingRef.current) return;
          closingRef.current = true;
          if (overlayRef.current) {
            overlayRef.current.setAttribute("data-drag", "out");
            overlayRef.current.classList.add("is-closing");
          }
          if (sheetRef.current) {
            sheetRef.current.style.transition = `transform ${MODAL_EXIT_MS}ms cubic-bezier(0.32, 0, 0.67, 0)`;
            sheetRef.current.style.transform = "translate3d(0, 100%, 0)";
          }
          setTimeout(() => onCloseRef.current(), MODAL_EXIT_MS);
        }
        const pressStartedOnOverlay = React.useRef(false);
        function onOverlayPointerDown(e) {
          pressStartedOnOverlay.current = e.target === e.currentTarget;
        }
        function onOverlayClick(e) {
          if (e.target === e.currentTarget && pressStartedOnOverlay.current) requestClose();
        }
        const Shell = onSubmit ? "form" : "div";
        const shellProps = { className: "modal-shell" };
        if (onSubmit) shellProps.onSubmit = onSubmit;
        const node = /* @__PURE__ */ React.createElement(
          "div",
          {
            className: "modal-overlay",
            ref: overlayRef,
            onMouseDown: onOverlayPointerDown,
            onTouchStart: onOverlayPointerDown,
            onClick: onOverlayClick
          },
          /* @__PURE__ */ React.createElement(
            "div",
            {
              className: "modal",
              ref: sheetRef,
              role: "dialog",
              "aria-modal": "true",
              "aria-labelledby": titleId,
              "aria-describedby": subtitle ? descId : void 0,
              tabIndex: -1,
              "data-at-top": edges.top ? "true" : "false",
              "data-at-bottom": edges.bottom ? "true" : "false"
            },
            /* @__PURE__ */ React.createElement("span", { className: "modal-accent", "aria-hidden": "true" }),
            /* @__PURE__ */ React.createElement(
              "div",
              {
                className: "modal-grab",
                onTouchStart: onDragStart,
                onTouchMove: onDragMove,
                onTouchEnd: onDragEnd,
                onTouchCancel: onDragEnd
              },
              /* @__PURE__ */ React.createElement("span", { className: "modal-grip", "aria-hidden": "true" }),
              /* @__PURE__ */ React.createElement("div", { className: "modal-header" }, icon && /* @__PURE__ */ React.createElement("span", { className: `icon-chip icon-chip-sm modal-icon tone-${tone}`, "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(Icon, { name: icon, size: 22 })), /* @__PURE__ */ React.createElement("div", { className: "modal-heading" }, /* @__PURE__ */ React.createElement("h3", { className: "modal-title", id: titleId }, title), subtitle && /* @__PURE__ */ React.createElement("p", { className: "modal-subtitle", id: descId }, subtitle)), /* @__PURE__ */ React.createElement("button", { type: "button", className: "modal-close", onClick: requestClose, "aria-label": "إغلاق" }, /* @__PURE__ */ React.createElement(Icon, { name: "close", size: 21, strokeWidth: 2.2 })))
            ),
            /* @__PURE__ */ React.createElement(Shell, __spreadValues({}, shellProps), /* @__PURE__ */ React.createElement("div", { className: "modal-body", ref: bodyRef, onScroll: syncEdges }, children), footer && /* @__PURE__ */ React.createElement("div", { className: "modal-footer" }, typeof footer === "function" ? footer(requestClose) : footer))
          )
        );
        return ReactDOM.createPortal(node, document.body);
      }
      function formatTime(dateStr) {
        const d = new Date(String(dateStr).replace(" ", "T"));
        return d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
      }
      function formatDateTime(dateStr) {
        const d = new Date(String(dateStr).replace(" ", "T"));
        return d.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });
      }
      function toDatetimeLocalValue(dateStr) {
        const d = dateStr ? new Date(String(dateStr).replace(" ", "T")) : /* @__PURE__ */ new Date();
        const pad = (n) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
          d.getMinutes()
        )}`;
      }
      function isStandaloneDisplay() {
        return window.matchMedia && window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
      }
      function isIOSDevice() {
        return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
      }
      function InstallBanner({ deferredPrompt, onInstalled }) {
        const [dismissed, setDismissed] = React.useState(() => {
          const at = Number(localStorage.getItem("ma3ak_install_dismissed_at") || 0);
          return Boolean(at) && Date.now() - at < 14 * 24 * 60 * 60 * 1e3;
        });
        if (dismissed || isStandaloneDisplay()) return null;
        const ios = isIOSDevice();
        if (!deferredPrompt && !ios) return null;
        function dismiss() {
          localStorage.setItem("ma3ak_install_dismissed_at", String(Date.now()));
          setDismissed(true);
        }
        async function install() {
          if (!deferredPrompt) return;
          deferredPrompt.prompt();
          try {
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === "accepted" && onInstalled) onInstalled();
          } catch (e) {
          }
          dismiss();
        }
        return /* @__PURE__ */ React.createElement("div", { className: "install-banner" }, /* @__PURE__ */ React.createElement("span", { className: "install-banner-icon", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(Icon, { name: "install", size: 28 })), /* @__PURE__ */ React.createElement("div", { className: "install-banner-body" }, /* @__PURE__ */ React.createElement("div", { className: "install-banner-title" }, "ثبّت معاك على شاشتك الرئيسية"), /* @__PURE__ */ React.createElement("div", { className: "install-banner-desc" }, ios ? 'دوس على زرار المشاركة تحت في Safari، بعدين "إضافة إلى الشاشة الرئيسية"' : "تفتحه بضغطة واحدة زي أي تطبيق تاني، من غير ما تدور عليه في المتصفح")), !ios && /* @__PURE__ */ React.createElement("button", { className: "install-banner-btn", onClick: install }, "تثبيت"), /* @__PURE__ */ React.createElement("button", { className: "install-banner-close", onClick: dismiss, "aria-label": "إغلاق" }, "×"));
      }
      async function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) {
          try {
            await navigator.clipboard.writeText(text);
            return true;
          } catch (e) {
          }
        }
        try {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          ta.style.top = "0";
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          const ok = document.execCommand("copy");
          document.body.removeChild(ta);
          return ok;
        } catch (e) {
          return false;
        }
      }
      /*! ===== js/components/Settings.jsx ===== */
      function SettingsSheet({
        darkMode,
        onSetDarkMode,
        fontLarge,
        onSetFontLarge,
        autoNightScale,
        onToggleAutoNightScale,
        alarmEnabled,
        onToggleAlarmEnabled,
        notifPermission,
        onRequestNotifPermission,
        showPatientOptions,
        onClose
      }) {
        const [notifHelpOpen, setNotifHelpOpen] = React.useState(false);
        return /* @__PURE__ */ React.createElement(
          Modal,
          {
            icon: "settings",
            tone: "gray",
            title: "الإعدادات",
            subtitle: "الاختيارات دي محفوظة على الجهاز ده لوحده",
            onClose,
            footer: (close) => /* @__PURE__ */ React.createElement(Button, { onClick: close }, "تم")
          },
          /* @__PURE__ */ React.createElement("div", { className: "settings-group-label" }, "المظهر"),
          /* @__PURE__ */ React.createElement("div", { className: "segmented" }, /* @__PURE__ */ React.createElement(
            "button",
            {
              className: darkMode ? "segmented-btn" : "segmented-btn active",
              onClick: () => onSetDarkMode(false)
            },
            /* @__PURE__ */ React.createElement(Icon, { name: "sun", size: 19 }),
            "فاتح"
          ), /* @__PURE__ */ React.createElement(
            "button",
            {
              className: darkMode ? "segmented-btn active" : "segmented-btn",
              onClick: () => onSetDarkMode(true)
            },
            /* @__PURE__ */ React.createElement(Icon, { name: "moon", size: 19 }),
            "داكن"
          )),
          /* @__PURE__ */ React.createElement("div", { className: "settings-group-label" }, "حجم الخط"),
          /* @__PURE__ */ React.createElement("div", { className: "segmented" }, /* @__PURE__ */ React.createElement(
            "button",
            {
              className: fontLarge ? "segmented-btn" : "segmented-btn active",
              onClick: () => onSetFontLarge(false)
            },
            "عادي"
          ), /* @__PURE__ */ React.createElement(
            "button",
            {
              className: fontLarge ? "segmented-btn active" : "segmented-btn",
              onClick: () => onSetFontLarge(true)
            },
            "كبير"
          )),
          showPatientOptions && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "settings-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "settings-row-title" }, "تكبير الخط تلقائيًا بالليل"), /* @__PURE__ */ React.createElement("div", { className: "settings-row-desc" }, "لتحسين الرؤية لشاشة المريض بعد الساعة 7 مساءً")), /* @__PURE__ */ React.createElement(
            "button",
            {
              className: autoNightScale ? "toggle-switch on" : "toggle-switch",
              onClick: onToggleAutoNightScale,
              role: "switch",
              "aria-checked": autoNightScale,
              "aria-label": "تكبير الخط تلقائيًا بالليل"
            },
            /* @__PURE__ */ React.createElement("span", { className: "toggle-thumb" })
          )), /* @__PURE__ */ React.createElement("div", { className: "settings-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "settings-row-title" }, "صوت التذكير بالجرعات"), /* @__PURE__ */ React.createElement("div", { className: "settings-row-desc" }, "رنة وفايبريشن لما ميعاد الدوا ييجي")), /* @__PURE__ */ React.createElement(
            "button",
            {
              className: alarmEnabled ? "toggle-switch on" : "toggle-switch",
              onClick: onToggleAlarmEnabled,
              role: "switch",
              "aria-checked": alarmEnabled,
              "aria-label": "صوت التذكير بالجرعات"
            },
            /* @__PURE__ */ React.createElement("span", { className: "toggle-thumb" })
          )), /* @__PURE__ */ React.createElement("div", { className: "settings-row settings-row-wrap" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "settings-row-title" }, "إشعارات المتصفح"), /* @__PURE__ */ React.createElement("div", { className: "settings-row-desc" }, "تنبيه فوري بمواعيد الدوا")), notifPermission === "granted" ? /* @__PURE__ */ React.createElement("span", { className: "settings-notif-ok" }, /* @__PURE__ */ React.createElement(Icon, { name: "checkCircle", size: 17 }), "مفعّل") : notifPermission === "unsupported" ? /* @__PURE__ */ React.createElement("span", { className: "settings-notif-ok muted" }, "مش متاح") : notifPermission === "denied" ? /* @__PURE__ */ React.createElement(
            "button",
            {
              className: "settings-notif-btn settings-notif-btn-muted",
              onClick: () => setNotifHelpOpen((v) => !v)
            },
            "موقوفة - إزاي أفعلها؟"
          ) : /* @__PURE__ */ React.createElement("button", { className: "settings-notif-btn", onClick: onRequestNotifPermission }, "تفعيل"), notifPermission === "denied" && notifHelpOpen && /* @__PURE__ */ React.createElement("div", { className: "settings-notif-help" }, 'افتح إعدادات الموقع من المتصفح (دوس على علامة القفل جنب عنوان الموقع فوق) وفعّل "الإشعارات" من هناك، بعدين ارجع للتطبيق.')))
        );
      }
      /*! ===== js/components/Auth.jsx ===== */
      const APP_FEATURES = [
        {
          icon: "pill",
          title: "مواعيد الدوا",
          desc: "كل جرعة في ميعادها، والمريض بيأكد إنه خدها بضغطة واحدة."
        },
        {
          icon: "bell",
          title: "تذكير بصوت وإشعار",
          desc: "رنّة وفايبريشن وإشعار على موبايل المريض أول ما الميعاد ييجي.",
          tone: "accent"
        },
        {
          icon: "alert",
          title: 'زرار "حصلت مشكلة؟"',
          desc: "الدوا خلص؟ حاسس بتعب؟ عايز حد يكلمك؟ ضغطة واحدة والخبر بيوصلك فورًا.",
          tone: "danger"
        },
        {
          icon: "calendar",
          title: "المواعيد الطبية",
          desc: "مواعيد الدكاترة والتحاليل، مع تذكير تلقائي قبل الموعد بـ 24 ساعة.",
          tone: "info"
        },
        {
          icon: "stethoscope",
          title: "القياسات الصحية",
          desc: "ضغط، سكر، وزن، نبض، وحرارة - كل قياس متسجّل بتاريخه وقدامك في أي وقت."
        },
        {
          icon: "link",
          title: "المريض بيدخل بلينك واحد",
          desc: "من غير حساب ولا باسورد يحفظه - يدوس على اللينك ويلاقي كل حاجة جاهزة.",
          tone: "info"
        },
        {
          icon: "users",
          title: "أكتر من متابع",
          desc: "الإخوات كلهم يتابعوا نفس الشخص بكود مشاركة، وكل واحد شايف نفس البيانات.",
          tone: "accent"
        },
        {
          icon: "install",
          title: "يتثبّت زي أي تطبيق",
          desc: "شغال على الموبايل والكمبيوتر، وممكن تحطه على شاشتك الرئيسية بضغطة."
        }
      ];
      const APP_BADGES = [
        { icon: "textSize", label: "خط كبير وأزرار واسعة" },
        { icon: "moon", label: "وضع ليلي" },
        { icon: "speaker", label: "نطق صوتي للجرعة" },
        { icon: "speech", label: "عربي بالكامل" }
      ];
      function AuthScreen({ onAuthenticated, initialError }) {
        const [mode, setMode] = React.useState("login");
        const [error, setError] = React.useState(initialError || "");
        const [loading, setLoading] = React.useState(false);
        async function handleLogin(identifier, password) {
          setError("");
          setLoading(true);
          try {
            const data = await api.login(identifier, password);
            setToken(data.token);
            await onAuthenticated(data.user);
          } catch (e) {
            setError(e.message);
          } finally {
            setLoading(false);
          }
        }
        async function handleRegister(payload) {
          setError("");
          setLoading(true);
          try {
            const data = await api.register(payload);
            setToken(data.token);
            await onAuthenticated(data.user);
          } catch (e) {
            setError(e.message);
          } finally {
            setLoading(false);
          }
        }
        return /* @__PURE__ */ React.createElement("div", { className: "auth-screen" }, /* @__PURE__ */ React.createElement("div", { className: "auth-mesh", "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("div", { className: "auth-grain", "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("div", { className: "auth-layout" }, /* @__PURE__ */ React.createElement("section", { className: "auth-panel" }, /* @__PURE__ */ React.createElement("div", { className: "auth-card" }, /* @__PURE__ */ React.createElement("div", { className: "auth-card-header" }, /* @__PURE__ */ React.createElement("div", { className: "auth-card-logo", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(Icon, { name: "brand", size: 38, strokeWidth: 1.8 })), /* @__PURE__ */ React.createElement("h1", { className: "auth-card-title" }, "معاك"), /* @__PURE__ */ React.createElement("p", { className: "auth-card-tag" }, "في كل خطوة، معاك")), /* @__PURE__ */ React.createElement("div", { className: "auth-card-body" }, /* @__PURE__ */ React.createElement("div", { className: "tabs", role: "tablist", "aria-label": "نوع الدخول" }, /* @__PURE__ */ React.createElement(
          "button",
          {
            role: "tab",
            "aria-selected": mode === "login",
            className: mode === "login" ? "tab active" : "tab",
            onClick: () => setMode("login")
          },
          "دخول"
        ), /* @__PURE__ */ React.createElement(
          "button",
          {
            role: "tab",
            "aria-selected": mode === "register",
            className: mode === "register" ? "tab active" : "tab",
            onClick: () => setMode("register")
          },
          "حساب جديد"
        )), /* @__PURE__ */ React.createElement(Banner, { type: "error", onClose: () => setError("") }, error), mode === "login" ? /* @__PURE__ */ React.createElement(LoginForm, { key: "login", onSubmit: handleLogin, loading }) : /* @__PURE__ */ React.createElement(RegisterForm, { key: "register", onSubmit: handleRegister, loading }), mode === "register" && /* @__PURE__ */ React.createElement("p", { className: "auth-hint" }, "الحساب ده لمتابعة كبير السن (ابن / بنت / ممرض). كبير السن نفسه مش محتاج يسجل — هتضيفه انت من جوه التطبيق وهيدخل بلينك واحد بس.")))), /* @__PURE__ */ React.createElement("section", { className: "auth-showcase" }, /* @__PURE__ */ React.createElement("div", { className: "auth-brand" }, /* @__PURE__ */ React.createElement("div", { className: "auth-logo", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(Icon, { name: "brand", size: 44, strokeWidth: 1.7 })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", { className: "auth-title text-gradient" }, "معاك"), /* @__PURE__ */ React.createElement("p", { className: "auth-tagline" }, "في كل خطوة، معاك"))), /* @__PURE__ */ React.createElement("p", { className: "auth-pitch" }, "تطبيق واحد بيخلي متابعة كبير السن أسهل: ", /* @__PURE__ */ React.createElement("strong", null, "إنت"), " بتجهّز الأدوية والمواعيد من موبايلك، و", /* @__PURE__ */ React.createElement("strong", null, "هو"), " بيفتح شاشة واحدة بسيطة فيها جرعة واحدة بس كل مرة."), /* @__PURE__ */ React.createElement("ul", { className: "auth-features stagger" }, APP_FEATURES.map((f) => /* @__PURE__ */ React.createElement("li", { key: f.title, className: "auth-feature" }, /* @__PURE__ */ React.createElement("span", { className: `auth-feature-icon${f.tone ? ` tone-${f.tone}` : ""}`, "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(Icon, { name: f.icon, size: 24 })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "auth-feature-title" }, f.title), /* @__PURE__ */ React.createElement("div", { className: "auth-feature-desc" }, f.desc))))), /* @__PURE__ */ React.createElement("div", { className: "auth-badges" }, APP_BADGES.map((b) => /* @__PURE__ */ React.createElement("span", { key: b.label, className: "auth-badge" }, /* @__PURE__ */ React.createElement(Icon, { name: b.icon, size: 16 }), b.label))))));
      }
      function LoginForm({ onSubmit, loading }) {
        const [identifier, setIdentifier] = React.useState("");
        const [password, setPassword] = React.useState("");
        return /* @__PURE__ */ React.createElement(
          "form",
          {
            className: "auth-form",
            onSubmit: (e) => {
              e.preventDefault();
              onSubmit(identifier, password);
            }
          },
          /* @__PURE__ */ React.createElement(Field, { label: "رقم الموبايل أو الإيميل" }, /* @__PURE__ */ React.createElement(
            "input",
            {
              required: true,
              autoComplete: "username",
              value: identifier,
              onChange: (e) => setIdentifier(e.target.value),
              placeholder: "01xxxxxxxxx"
            }
          )),
          /* @__PURE__ */ React.createElement(Field, { label: "كلمة المرور" }, /* @__PURE__ */ React.createElement(
            "input",
            {
              type: "password",
              required: true,
              autoComplete: "current-password",
              value: password,
              onChange: (e) => setPassword(e.target.value)
            }
          )),
          /* @__PURE__ */ React.createElement(Button, { type: "submit", loading }, loading ? "جاري الدخول..." : "دخول")
        );
      }
      function RegisterForm({ onSubmit, loading }) {
        const [name, setName] = React.useState("");
        const [phone, setPhone] = React.useState("");
        const [email, setEmail] = React.useState("");
        const [password, setPassword] = React.useState("");
        return /* @__PURE__ */ React.createElement(
          "form",
          {
            className: "auth-form",
            onSubmit: (e) => {
              e.preventDefault();
              onSubmit({ name, phone, email, password });
            }
          },
          /* @__PURE__ */ React.createElement(Field, { label: "الاسم بالكامل" }, /* @__PURE__ */ React.createElement("input", { required: true, autoComplete: "name", value: name, onChange: (e) => setName(e.target.value) })),
          /* @__PURE__ */ React.createElement(Field, { label: "رقم الموبايل" }, /* @__PURE__ */ React.createElement(
            "input",
            {
              type: "tel",
              required: true,
              autoComplete: "tel",
              value: phone,
              onChange: (e) => setPhone(e.target.value),
              placeholder: "01xxxxxxxxx"
            }
          )),
          /* @__PURE__ */ React.createElement(Field, { label: "الإيميل (اختياري)" }, /* @__PURE__ */ React.createElement("input", { type: "email", autoComplete: "email", value: email, onChange: (e) => setEmail(e.target.value) })),
          /* @__PURE__ */ React.createElement(Field, { label: "كلمة المرور" }, /* @__PURE__ */ React.createElement(
            "input",
            {
              type: "password",
              required: true,
              minLength: 6,
              autoComplete: "new-password",
              value: password,
              onChange: (e) => setPassword(e.target.value)
            }
          )),
          /* @__PURE__ */ React.createElement(Button, { type: "submit", loading }, loading ? "جاري إنشاء الحساب..." : "إنشاء الحساب")
        );
      }
      /*! ===== js/components/Layout.jsx ===== */
      function AppLayout({
        user,
        patients,
        activePatientId,
        onSwitchPatient,
        view,
        onChangeView,
        onLogout,
        unreadCount,
        issueAlerts,
        onDismissIssue,
        onOpenSettings,
        children
      }) {
        const tabs = [
          { key: "today", label: "اليوم", icon: "home" },
          { key: "medications", label: "الأدوية", icon: "pill" },
          { key: "appointments", label: "المواعيد", icon: "calendar" },
          { key: "vitals", label: "القياسات", icon: "stethoscope" },
          { key: "notifications", label: "الإشعارات", icon: "bell" }
        ];
        if (user.role === "caregiver") {
          tabs.push({ key: "patients", label: "المرضى", icon: "users" });
        }
        const hasPatientSwitcher = user.role === "caregiver" && patients.length > 0;
        const userInitial = (user.name || "").trim()[0] || "؟";
        const activeIndex = Math.max(
          0,
          tabs.findIndex((t) => t.key === view)
        );
        return /* @__PURE__ */ React.createElement("div", { className: "app-shell ambient" }, /* @__PURE__ */ React.createElement("header", { className: "app-header" }, /* @__PURE__ */ React.createElement("div", { className: "header-inner" }, /* @__PURE__ */ React.createElement("div", { className: "header-row" }, /* @__PURE__ */ React.createElement("div", { className: "header-brand" }, /* @__PURE__ */ React.createElement("span", { className: "header-brand-logo", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(Icon, { name: "brand", size: 21, strokeWidth: 2 })), /* @__PURE__ */ React.createElement("span", { className: "header-brand-name" }, /* @__PURE__ */ React.createElement("span", { className: "header-brand-ar" }, "معاك"), /* @__PURE__ */ React.createElement("span", { className: "header-brand-en" }, "Ma3ak"))), hasPatientSwitcher && /* @__PURE__ */ React.createElement("div", { className: "patient-switcher" }, /* @__PURE__ */ React.createElement("span", { className: "patient-switcher-icon", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(Icon, { name: "user", size: 17 })), /* @__PURE__ */ React.createElement("div", { className: "patient-select-wrap" }, /* @__PURE__ */ React.createElement(
          "select",
          {
            className: "patient-select",
            value: activePatientId || "",
            onChange: (e) => onSwitchPatient(Number(e.target.value)),
            "aria-label": "بتتابع"
          },
          patients.map((p) => /* @__PURE__ */ React.createElement("option", { key: p.id, value: p.id }, p.name))
        ))), /* @__PURE__ */ React.createElement("div", { className: "header-actions" }, /* @__PURE__ */ React.createElement("div", { className: "header-user-chip", title: user.name }, /* @__PURE__ */ React.createElement("span", { className: "header-user-avatar", "aria-hidden": "true" }, userInitial), /* @__PURE__ */ React.createElement("span", { className: "header-user" }, user.name)), /* @__PURE__ */ React.createElement("div", { className: "header-icon-group" }, /* @__PURE__ */ React.createElement(
          "button",
          {
            className: "header-icon-btn",
            onClick: onOpenSettings,
            "aria-label": "الإعدادات",
            title: "الإعدادات"
          },
          /* @__PURE__ */ React.createElement(Icon, { name: "settings", size: 19 })
        ), /* @__PURE__ */ React.createElement("button", { className: "header-logout", onClick: onLogout, "aria-label": "تسجيل الخروج", title: "تسجيل الخروج" }, /* @__PURE__ */ React.createElement(Icon, { name: "logout", size: 17 }), /* @__PURE__ */ React.createElement("span", { className: "header-logout-label" }, "خروج"))))))), /* @__PURE__ */ React.createElement("main", { className: "app-main" }, issueAlerts && issueAlerts.length > 0 && /* @__PURE__ */ React.createElement(IssueAlerts, { alerts: issueAlerts, onDismiss: onDismissIssue }), children), /* @__PURE__ */ React.createElement("nav", { className: "tab-bar", "aria-label": "التنقل بين شاشات التطبيق" }, /* @__PURE__ */ React.createElement(
          "div",
          {
            className: "tab-bar-inner",
            style: { "--tab-count": String(tabs.length), "--tab-active": String(activeIndex) }
          },
          /* @__PURE__ */ React.createElement("span", { className: "tab-surface", "aria-hidden": "true" }),
          /* @__PURE__ */ React.createElement("span", { className: "tab-knob", "aria-hidden": "true" }),
          tabs.map((t) => /* @__PURE__ */ React.createElement(
            "button",
            {
              key: t.key,
              className: view === t.key ? "tab-bar-item active" : "tab-bar-item",
              onClick: () => onChangeView(t.key),
              "aria-current": view === t.key ? "page" : void 0
            },
            /* @__PURE__ */ React.createElement("span", { className: "tab-icon-wrap" }, /* @__PURE__ */ React.createElement("span", { className: "tab-icon" }, /* @__PURE__ */ React.createElement(Icon, { name: t.icon, size: 25 })), t.key === "notifications" && unreadCount > 0 && /* @__PURE__ */ React.createElement("span", { className: "badge" }, unreadCount)),
            /* @__PURE__ */ React.createElement("span", { className: "tab-label" }, t.label)
          ))
        )));
      }
      function IssueAlerts({ alerts, onDismiss }) {
        return /* @__PURE__ */ React.createElement("div", { className: "issue-alert-stack" }, alerts.map((n) => /* @__PURE__ */ React.createElement("div", { key: n.id, className: "issue-alert" }, /* @__PURE__ */ React.createElement("span", { className: "issue-alert-icon", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(Icon, { name: "alert", size: 26, strokeWidth: 2.1 })), /* @__PURE__ */ React.createElement("div", { className: "issue-alert-body" }, /* @__PURE__ */ React.createElement("div", { className: "issue-alert-message" }, n.message), /* @__PURE__ */ React.createElement("div", { className: "issue-alert-time" }, formatDateTime(n.created_at))), /* @__PURE__ */ React.createElement("button", { className: "issue-alert-dismiss", onClick: () => onDismiss(n.id) }, "تمام"))));
      }
      /*! ===== js/components/Dashboard.jsx ===== */
      function TodayView({ patientId }) {
        const [doses, setDoses] = React.useState([]);
        const [loading, setLoading] = React.useState(true);
        const [error, setError] = React.useState("");
        const load = React.useCallback(async () => {
          if (!patientId) return;
          setLoading(true);
          try {
            const data = await api.getTodayDoses(patientId);
            setDoses(data.doses);
          } catch (e) {
            setError(e.message);
          } finally {
            setLoading(false);
          }
        }, [patientId]);
        React.useEffect(() => {
          load();
        }, [load]);
        async function handleTake(doseId) {
          try {
            await api.takeDose(doseId);
            load();
          } catch (e) {
            setError(e.message);
          }
        }
        if (!patientId) {
          return /* @__PURE__ */ React.createElement(EmptyState, { icon: "users", text: "لسه معندكش مريض. روح لتاب (المرضى) وضيف أول واحد." });
        }
        if (loading) return /* @__PURE__ */ React.createElement(SkeletonCards, { count: 3 });
        const pending = doses.filter((d) => d.status === "pending");
        const done = doses.filter((d) => d.status !== "pending");
        const taken = doses.filter((d) => d.status === "taken").length;
        const missed = doses.filter((d) => d.status === "missed").length;
        return /* @__PURE__ */ React.createElement("div", { className: "view" }, /* @__PURE__ */ React.createElement("h2", { className: "view-title" }, "جرعات النهارده"), /* @__PURE__ */ React.createElement(Banner, { onClose: () => setError("") }, error), doses.length > 0 && /* @__PURE__ */ React.createElement(DaySummary, { total: doses.length, taken, missed, left: pending.length }), doses.length === 0 && /* @__PURE__ */ React.createElement(EmptyState, { icon: "pill", text: "مفيش أدوية مسجلة النهارده" }), pending.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "dose-list stagger" }, pending.map((d) => /* @__PURE__ */ React.createElement(Card, { key: d.id, className: "dose-card" }, /* @__PURE__ */ React.createElement("div", { className: "dose-info" }, /* @__PURE__ */ React.createElement("div", { className: "dose-time" }, formatTime(d.scheduled_at)), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "dose-name" }, d.name), d.dosage && /* @__PURE__ */ React.createElement("div", { className: "dose-dosage" }, d.dosage))), /* @__PURE__ */ React.createElement(
          Button,
          {
            onClick: () => handleTake(d.id),
            "aria-label": `تسجيل جرعة ${d.name} الساعة ${formatTime(d.scheduled_at)} كمتناولة`
          },
          /* @__PURE__ */ React.createElement(Icon, { name: "check", size: 20, strokeWidth: 2.4 }),
          "اتاخد"
        )))), done.length > 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("h3", { className: "view-subtitle" }, "تم تسجيلها"), /* @__PURE__ */ React.createElement("div", { className: "dose-list stagger" }, done.map((d) => /* @__PURE__ */ React.createElement(Card, { key: d.id, className: "dose-card done" }, /* @__PURE__ */ React.createElement("div", { className: "dose-info" }, /* @__PURE__ */ React.createElement("div", { className: "dose-time" }, formatTime(d.scheduled_at)), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "dose-name" }, d.name))), /* @__PURE__ */ React.createElement("span", { className: `status-pill ${d.status}` }, /* @__PURE__ */ React.createElement(Icon, { name: d.status === "taken" ? "checkCircle" : "warning", size: 17 }), d.status === "taken" ? "اتاخدت" : "فاتت"))))));
      }
      function DaySummary({ total, taken, missed, left }) {
        const pct = total > 0 ? Math.round(taken / total * 100) : 0;
        const allDone = total > 0 && left === 0 && missed === 0;
        let meta;
        if (allDone) meta = "تمام، كل جرعات النهارده اتاخدت.";
        else if (left > 0) meta = `فاضل ${left} ${left === 1 ? "جرعة" : "جرعات"} النهارده.`;
        else meta = "مفيش جرعات مستنية دلوقتي.";
        return /* @__PURE__ */ React.createElement("div", { className: `day-summary${allDone ? " is-complete" : ""}` }, /* @__PURE__ */ React.createElement(
          "div",
          {
            className: "progress-ring",
            style: { "--progress": pct },
            role: "img",
            "aria-label": `${taken} من ${total} جرعات اتاخدت`
          },
          /* @__PURE__ */ React.createElement("span", { className: "progress-ring-value" }, taken, "/", total)
        ), /* @__PURE__ */ React.createElement("div", { className: "day-summary-body" }, /* @__PURE__ */ React.createElement("div", { className: "day-summary-title" }, allDone ? "خلصت النهارده" : "متابعة اليوم"), /* @__PURE__ */ React.createElement("div", { className: "day-summary-meta" }, meta)), /* @__PURE__ */ React.createElement("div", { className: "day-summary-stats", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("span", { className: "day-stat tone-done" }, /* @__PURE__ */ React.createElement(Icon, { name: "checkCircle", size: 15 }), /* @__PURE__ */ React.createElement("span", { className: "day-stat-value" }, taken), " اتاخدت"), left > 0 && /* @__PURE__ */ React.createElement("span", { className: "day-stat tone-left" }, /* @__PURE__ */ React.createElement(Icon, { name: "clock", size: 15 }), /* @__PURE__ */ React.createElement("span", { className: "day-stat-value" }, left), " مستنية"), missed > 0 && /* @__PURE__ */ React.createElement("span", { className: "day-stat tone-missed" }, /* @__PURE__ */ React.createElement(Icon, { name: "warning", size: 15 }), /* @__PURE__ */ React.createElement("span", { className: "day-stat-value" }, missed), " فاتت")));
      }
      /*! ===== js/components/Medications.jsx ===== */
      function MedicationsView({ patientId }) {
        const [meds, setMeds] = React.useState([]);
        const [loading, setLoading] = React.useState(true);
        const [error, setError] = React.useState("");
        const [showForm, setShowForm] = React.useState(false);
        const [editing, setEditing] = React.useState(null);
        const load = React.useCallback(async () => {
          if (!patientId) return;
          setLoading(true);
          try {
            const data = await api.getMedications(patientId);
            setMeds(data.medications);
          } catch (e) {
            setError(e.message);
          } finally {
            setLoading(false);
          }
        }, [patientId]);
        React.useEffect(() => {
          load();
        }, [load]);
        async function handleDelete(id) {
          if (!confirm("متأكد إنك عايز توقف الدواء ده؟")) return;
          try {
            await api.deleteMedication(id);
            load();
          } catch (e) {
            setError(e.message);
          }
        }
        if (!patientId) {
          return /* @__PURE__ */ React.createElement(EmptyState, { icon: "user", text: "لسه معندكش مريض مربوط." });
        }
        return /* @__PURE__ */ React.createElement("div", { className: "view" }, /* @__PURE__ */ React.createElement("div", { className: "view-header" }, /* @__PURE__ */ React.createElement("h2", { className: "view-title" }, "الأدوية"), /* @__PURE__ */ React.createElement(
          Button,
          {
            onClick: () => {
              setEditing(null);
              setShowForm(true);
            }
          },
          /* @__PURE__ */ React.createElement(Icon, { name: "plus", size: 20, strokeWidth: 2.4 }),
          "دواء جديد"
        )), /* @__PURE__ */ React.createElement(Banner, { onClose: () => setError("") }, error), loading ? /* @__PURE__ */ React.createElement(SkeletonCards, { count: 3 }) : meds.length === 0 ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "pill", text: "مفيش أدوية مسجلة، ضيف أول دواء." }) : /* @__PURE__ */ React.createElement("div", { className: "med-list stagger" }, meds.map((m) => {
          const times = typeof m.times === "string" ? JSON.parse(m.times) : m.times;
          return /* @__PURE__ */ React.createElement(Card, { key: m.id, className: "med-card" }, /* @__PURE__ */ React.createElement("div", { className: "med-main" }, /* @__PURE__ */ React.createElement("div", { className: "med-name" }, m.name), m.dosage && /* @__PURE__ */ React.createElement("div", { className: "med-dosage" }, m.dosage), /* @__PURE__ */ React.createElement("div", { className: "med-times" }, times.map((t) => /* @__PURE__ */ React.createElement("span", { key: t, className: "chip" }, /* @__PURE__ */ React.createElement(Icon, { name: "clock", size: 15 }), t))), m.notes && /* @__PURE__ */ React.createElement("div", { className: "med-notes" }, m.notes)), /* @__PURE__ */ React.createElement("div", { className: "med-actions" }, /* @__PURE__ */ React.createElement(
            Button,
            {
              variant: "ghost",
              "aria-label": `تعديل دواء ${m.name}`,
              onClick: () => {
                setEditing(m);
                setShowForm(true);
              }
            },
            "تعديل"
          ), /* @__PURE__ */ React.createElement(Button, { variant: "danger", "aria-label": `إيقاف دواء ${m.name}`, onClick: () => handleDelete(m.id) }, "إيقاف")));
        })), showForm && /* @__PURE__ */ React.createElement(
          MedicationForm,
          {
            patientId,
            medication: editing,
            onClose: () => setShowForm(false),
            onSaved: () => {
              setShowForm(false);
              load();
            }
          }
        ));
      }
      function MedicationForm({ patientId, medication, onClose, onSaved }) {
        const isEdit = !!medication;
        const [name, setName] = React.useState(medication ? medication.name : "");
        const [dosage, setDosage] = React.useState(medication ? medication.dosage || "" : "");
        const [notes, setNotes] = React.useState(medication ? medication.notes || "" : "");
        const [times, setTimes] = React.useState(
          medication ? typeof medication.times === "string" ? JSON.parse(medication.times) : medication.times : ["08:00"]
        );
        const [startDate, setStartDate] = React.useState(
          medication ? medication.start_date : (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)
        );
        const [error, setError] = React.useState("");
        const [saving, setSaving] = React.useState(false);
        function updateTime(i, value) {
          const next = [...times];
          next[i] = value;
          setTimes(next);
        }
        function addTime() {
          setTimes([...times, "08:00"]);
        }
        function removeTime(i) {
          setTimes(times.filter((_, idx) => idx !== i));
        }
        async function handleSubmit(e) {
          e.preventDefault();
          setSaving(true);
          setError("");
          try {
            const payload = { patientId, name, dosage, notes, times, startDate };
            if (isEdit) await api.updateMedication(medication.id, payload);
            else await api.addMedication(payload);
            onSaved();
          } catch (e2) {
            setError(e2.message);
          } finally {
            setSaving(false);
          }
        }
        return /* @__PURE__ */ React.createElement(
          Modal,
          {
            icon: "pill",
            tone: "primary",
            title: isEdit ? "تعديل الدواء" : "دواء جديد",
            subtitle: isEdit ? "التعديل بيسري على جرعات النهارده اللي لسه ميعادها مجاش" : "اكتب اسمه ومواعيده، وإحنا هنفكّر المريض بيه في وقته",
            onClose,
            onSubmit: handleSubmit,
            footer: (close) => /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(Button, { type: "button", variant: "soft", onClick: close, disabled: saving }, "إلغاء"), /* @__PURE__ */ React.createElement(Button, { type: "submit", loading: saving }, saving ? "جاري الحفظ..." : isEdit ? "حفظ التعديل" : "إضافة الدواء"))
          },
          /* @__PURE__ */ React.createElement(Banner, { onClose: () => setError("") }, error),
          /* @__PURE__ */ React.createElement(Field, { label: "اسم الدواء" }, /* @__PURE__ */ React.createElement("input", { required: true, value: name, onChange: (e) => setName(e.target.value) })),
          /* @__PURE__ */ React.createElement(Field, { label: "الجرعة (مثال: قرص واحد)" }, /* @__PURE__ */ React.createElement("input", { value: dosage, onChange: (e) => setDosage(e.target.value) })),
          /* @__PURE__ */ React.createElement(FieldGroup, { label: "مواعيد الجرعات" }, /* @__PURE__ */ React.createElement("div", { className: "times-list" }, times.map((t, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: "time-row" }, /* @__PURE__ */ React.createElement("span", { className: "time-row-index", "aria-hidden": "true" }, i + 1), /* @__PURE__ */ React.createElement(
            "input",
            {
              type: "time",
              "aria-label": `ميعاد الجرعة رقم ${i + 1}`,
              value: t,
              onChange: (e) => updateTime(i, e.target.value)
            }
          ), times.length > 1 && /* @__PURE__ */ React.createElement(
            "button",
            {
              type: "button",
              className: "icon-btn",
              "aria-label": `حذف ميعاد الجرعة رقم ${i + 1}`,
              onClick: () => removeTime(i)
            },
            /* @__PURE__ */ React.createElement(Icon, { name: "trash", size: 20 })
          ))), /* @__PURE__ */ React.createElement(Button, { type: "button", variant: "ghost", onClick: addTime }, /* @__PURE__ */ React.createElement(Icon, { name: "plus", size: 18, strokeWidth: 2.4 }), "إضافة معاد"))),
          /* @__PURE__ */ React.createElement(Field, { label: "تاريخ البداية" }, /* @__PURE__ */ React.createElement("input", { type: "date", required: true, value: startDate, onChange: (e) => setStartDate(e.target.value) })),
          /* @__PURE__ */ React.createElement(Field, { label: "ملاحظات" }, /* @__PURE__ */ React.createElement("textarea", { value: notes, onChange: (e) => setNotes(e.target.value) }))
        );
      }
      /*! ===== js/components/Appointments.jsx ===== */
      function AppointmentsView({ patientId }) {
        const [appts, setAppts] = React.useState([]);
        const [loading, setLoading] = React.useState(true);
        const [error, setError] = React.useState("");
        const [showForm, setShowForm] = React.useState(false);
        const [editing, setEditing] = React.useState(null);
        const load = React.useCallback(async () => {
          if (!patientId) return;
          setLoading(true);
          try {
            const data = await api.getAppointments(patientId);
            setAppts(data.appointments);
          } catch (e) {
            setError(e.message);
          } finally {
            setLoading(false);
          }
        }, [patientId]);
        React.useEffect(() => {
          load();
        }, [load]);
        async function handleDelete(id) {
          if (!confirm("متأكد إنك عايز تلغي الموعد ده؟")) return;
          try {
            await api.deleteAppointment(id);
            load();
          } catch (e) {
            setError(e.message);
          }
        }
        if (!patientId) {
          return /* @__PURE__ */ React.createElement(EmptyState, { icon: "user", text: "لسه معندكش مريض مربوط." });
        }
        const now = /* @__PURE__ */ new Date();
        const upcoming = appts.filter((a) => new Date(a.appointment_at.replace(" ", "T")) >= now);
        const past = appts.filter((a) => new Date(a.appointment_at.replace(" ", "T")) < now);
        return /* @__PURE__ */ React.createElement("div", { className: "view" }, /* @__PURE__ */ React.createElement("div", { className: "view-header" }, /* @__PURE__ */ React.createElement("h2", { className: "view-title" }, "المواعيد"), /* @__PURE__ */ React.createElement(
          Button,
          {
            onClick: () => {
              setEditing(null);
              setShowForm(true);
            }
          },
          /* @__PURE__ */ React.createElement(Icon, { name: "plus", size: 20, strokeWidth: 2.4 }),
          "موعد جديد"
        )), /* @__PURE__ */ React.createElement(Banner, { onClose: () => setError("") }, error), loading ? /* @__PURE__ */ React.createElement(SkeletonCards, { count: 3 }) : appts.length === 0 ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "calendar", text: "مفيش مواعيد مسجلة." }) : /* @__PURE__ */ React.createElement(React.Fragment, null, upcoming.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "dose-list stagger" }, upcoming.map((a) => /* @__PURE__ */ React.createElement(
          AppointmentCard,
          {
            key: a.id,
            appt: a,
            onEdit: () => {
              setEditing(a);
              setShowForm(true);
            },
            onDelete: () => handleDelete(a.id)
          }
        ))), past.length > 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("h3", { className: "view-subtitle" }, "مواعيد سابقة"), /* @__PURE__ */ React.createElement("div", { className: "dose-list" }, past.map((a) => /* @__PURE__ */ React.createElement(
          AppointmentCard,
          {
            key: a.id,
            appt: a,
            onEdit: () => {
              setEditing(a);
              setShowForm(true);
            },
            onDelete: () => handleDelete(a.id)
          }
        ))))), showForm && /* @__PURE__ */ React.createElement(
          AppointmentForm,
          {
            patientId,
            appointment: editing,
            onClose: () => setShowForm(false),
            onSaved: () => {
              setShowForm(false);
              load();
            }
          }
        ));
      }
      function AppointmentCard({ appt, onEdit, onDelete }) {
        return /* @__PURE__ */ React.createElement(Card, { className: "appt-card" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "appt-title" }, appt.title), (appt.doctor_name || appt.location) && /* @__PURE__ */ React.createElement("div", { className: "appt-meta" }, appt.doctor_name, appt.doctor_name && appt.location ? " - " : "", appt.location), /* @__PURE__ */ React.createElement("div", { className: "appt-datetime" }, formatDateTime(appt.appointment_at)), appt.notes && /* @__PURE__ */ React.createElement("div", { className: "med-notes" }, appt.notes)), /* @__PURE__ */ React.createElement("div", { className: "med-actions" }, /* @__PURE__ */ React.createElement(Button, { variant: "ghost", "aria-label": `تعديل موعد ${appt.title}`, onClick: onEdit }, "تعديل"), /* @__PURE__ */ React.createElement(Button, { variant: "danger", "aria-label": `حذف موعد ${appt.title}`, onClick: onDelete }, "حذف")));
      }
      function AppointmentForm({ patientId, appointment, onClose, onSaved }) {
        const isEdit = !!appointment;
        const [title, setTitle] = React.useState(appointment ? appointment.title : "");
        const [doctorName, setDoctorName] = React.useState(appointment ? appointment.doctor_name || "" : "");
        const [location, setLocation] = React.useState(appointment ? appointment.location || "" : "");
        const [appointmentAt, setAppointmentAt] = React.useState(
          toDatetimeLocalValue(appointment ? appointment.appointment_at : null)
        );
        const [notes, setNotes] = React.useState(appointment ? appointment.notes || "" : "");
        const [error, setError] = React.useState("");
        const [saving, setSaving] = React.useState(false);
        async function handleSubmit(e) {
          e.preventDefault();
          setSaving(true);
          setError("");
          try {
            const payload = {
              patientId,
              title,
              doctorName,
              location,
              appointmentAt: appointmentAt.replace("T", " ") + ":00",
              notes
            };
            if (isEdit) await api.updateAppointment(appointment.id, payload);
            else await api.addAppointment(payload);
            onSaved();
          } catch (e2) {
            setError(e2.message);
          } finally {
            setSaving(false);
          }
        }
        return /* @__PURE__ */ React.createElement(
          Modal,
          {
            icon: "calendar",
            tone: "info",
            title: isEdit ? "تعديل الموعد" : "موعد جديد",
            subtitle: "هيظهر للمريض في شاشته، وهنفكّره بيه قبل ميعاده",
            onClose,
            onSubmit: handleSubmit,
            footer: (close) => /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(Button, { type: "button", variant: "soft", onClick: close, disabled: saving }, "إلغاء"), /* @__PURE__ */ React.createElement(Button, { type: "submit", loading: saving }, saving ? "جاري الحفظ..." : isEdit ? "حفظ التعديل" : "إضافة الموعد"))
          },
          /* @__PURE__ */ React.createElement(Banner, { onClose: () => setError("") }, error),
          /* @__PURE__ */ React.createElement(Field, { label: "عنوان الموعد (مثال: كشف قلب)" }, /* @__PURE__ */ React.createElement("input", { required: true, value: title, onChange: (e) => setTitle(e.target.value) })),
          /* @__PURE__ */ React.createElement(Field, { label: "اسم الدكتور" }, /* @__PURE__ */ React.createElement("input", { value: doctorName, onChange: (e) => setDoctorName(e.target.value) })),
          /* @__PURE__ */ React.createElement(Field, { label: "المكان" }, /* @__PURE__ */ React.createElement("input", { value: location, onChange: (e) => setLocation(e.target.value) })),
          /* @__PURE__ */ React.createElement(Field, { label: "التاريخ والوقت" }, /* @__PURE__ */ React.createElement(
            "input",
            {
              type: "datetime-local",
              required: true,
              value: appointmentAt,
              onChange: (e) => setAppointmentAt(e.target.value)
            }
          )),
          /* @__PURE__ */ React.createElement(Field, { label: "ملاحظات" }, /* @__PURE__ */ React.createElement("textarea", { value: notes, onChange: (e) => setNotes(e.target.value) }))
        );
      }
      /*! ===== js/components/Vitals.jsx ===== */
      const VITAL_TYPES = [
        { key: "blood_pressure", label: "ضغط الدم", icon: "pulse", tone: "danger" },
        { key: "blood_sugar", label: "السكر", icon: "droplet", tone: "info" },
        { key: "weight", label: "الوزن", icon: "scale", tone: "primary" },
        { key: "heart_rate", label: "النبض", icon: "heart", tone: "rose" },
        { key: "temperature", label: "الحرارة", icon: "thermometer", tone: "accent" }
      ];
      function formatVitalValue(type, value) {
        if (type === "blood_pressure") return `${value.systolic}/${value.diastolic}`;
        if (value && typeof value === "object") return `${value.value}${value.unit ? " " + value.unit : ""}`;
        return String(value);
      }
      function VitalsView({ patientId }) {
        const [activeType, setActiveType] = React.useState("blood_pressure");
        const [vitals, setVitals] = React.useState([]);
        const [loading, setLoading] = React.useState(true);
        const [error, setError] = React.useState("");
        const [showForm, setShowForm] = React.useState(false);
        const load = React.useCallback(async () => {
          if (!patientId) return;
          setLoading(true);
          try {
            const data = await api.getVitals(patientId, activeType);
            setVitals(data.vitals);
          } catch (e) {
            setError(e.message);
          } finally {
            setLoading(false);
          }
        }, [patientId, activeType]);
        React.useEffect(() => {
          load();
        }, [load]);
        async function handleDelete(id) {
          if (!confirm("متأكد إنك عايز تمسح القياس ده؟")) return;
          try {
            await api.deleteVital(id);
            load();
          } catch (e) {
            setError(e.message);
          }
        }
        if (!patientId) {
          return /* @__PURE__ */ React.createElement(EmptyState, { icon: "user", text: "لسه معندكش مريض مربوط." });
        }
        return /* @__PURE__ */ React.createElement("div", { className: "view" }, /* @__PURE__ */ React.createElement("div", { className: "view-header" }, /* @__PURE__ */ React.createElement("h2", { className: "view-title" }, "القياسات الصحية"), /* @__PURE__ */ React.createElement(Button, { onClick: () => setShowForm(true) }, /* @__PURE__ */ React.createElement(Icon, { name: "plus", size: 20, strokeWidth: 2.4 }), "قياس جديد")), /* @__PURE__ */ React.createElement(Banner, { onClose: () => setError("") }, error), /* @__PURE__ */ React.createElement("div", { className: "vital-type-grid", role: "group", "aria-label": "نوع القياس المعروض" }, VITAL_TYPES.map((t) => /* @__PURE__ */ React.createElement(
          "button",
          {
            key: t.key,
            className: activeType === t.key ? "vital-type-btn active" : "vital-type-btn",
            "aria-pressed": activeType === t.key,
            onClick: () => setActiveType(t.key)
          },
          /* @__PURE__ */ React.createElement("span", { className: `icon-chip icon-chip-sm tone-${t.tone}`, "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(Icon, { name: t.icon, size: 21 })),
          /* @__PURE__ */ React.createElement("span", null, t.label)
        ))), loading ? /* @__PURE__ */ React.createElement(SkeletonCards, { count: 3 }) : vitals.length === 0 ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "stethoscope", text: "مفيش قياسات مسجلة للنوع ده لسه." }) : /* @__PURE__ */ React.createElement(Card, null, vitals.map((v) => {
          const value = typeof v.value_json === "string" ? JSON.parse(v.value_json) : v.value_json;
          return /* @__PURE__ */ React.createElement("div", { key: v.id, className: "vital-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "vital-value" }, formatVitalValue(v.type, value)), /* @__PURE__ */ React.createElement("div", { className: "vital-date" }, formatDateTime(v.recorded_at))), /* @__PURE__ */ React.createElement(
            "button",
            {
              className: "icon-btn",
              "aria-label": `حذف قياس ${formatVitalValue(v.type, value)} بتاريخ ${formatDateTime(v.recorded_at)}`,
              onClick: () => handleDelete(v.id)
            },
            /* @__PURE__ */ React.createElement(Icon, { name: "trash", size: 20 })
          ));
        })), showForm && /* @__PURE__ */ React.createElement(
          VitalForm,
          {
            patientId,
            defaultType: activeType,
            onClose: () => setShowForm(false),
            onSaved: () => {
              setShowForm(false);
              load();
            }
          }
        ));
      }
      function VitalForm({ patientId, defaultType, onClose, onSaved }) {
        const [type, setType] = React.useState(defaultType);
        const [systolic, setSystolic] = React.useState("");
        const [diastolic, setDiastolic] = React.useState("");
        const [value, setValue] = React.useState("");
        const [recordedAt, setRecordedAt] = React.useState(toDatetimeLocalValue(null));
        const [error, setError] = React.useState("");
        const [saving, setSaving] = React.useState(false);
        const unitByType = {
          blood_sugar: "mg/dL",
          weight: "كجم",
          heart_rate: "نبضة/دقيقة",
          temperature: "°C"
        };
        async function handleSubmit(e) {
          e.preventDefault();
          setSaving(true);
          setError("");
          try {
            let valueObj;
            if (type === "blood_pressure") {
              if (!systolic || !diastolic) throw new Error("اكتب الرقمين");
              valueObj = { systolic: Number(systolic), diastolic: Number(diastolic) };
            } else {
              if (!value) throw new Error("اكتب القيمة");
              valueObj = { value: Number(value), unit: unitByType[type] };
            }
            await api.addVital({
              patientId,
              type,
              value: valueObj,
              recordedAt: recordedAt.replace("T", " ") + ":00"
            });
            onSaved();
          } catch (e2) {
            setError(e2.message);
          } finally {
            setSaving(false);
          }
        }
        const selected = VITAL_TYPES.find((t) => t.key === type) || VITAL_TYPES[0];
        return /* @__PURE__ */ React.createElement(
          Modal,
          {
            icon: selected.icon,
            tone: selected.tone,
            title: "قياس جديد",
            subtitle: `بتسجّل ${selected.label} - هيتحفظ في تاريخ المريض`,
            onClose,
            onSubmit: handleSubmit,
            footer: (close) => /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(Button, { type: "button", variant: "soft", onClick: close, disabled: saving }, "إلغاء"), /* @__PURE__ */ React.createElement(Button, { type: "submit", loading: saving }, saving ? "جاري الحفظ..." : "حفظ القياس"))
          },
          /* @__PURE__ */ React.createElement(Banner, { onClose: () => setError("") }, error),
          /* @__PURE__ */ React.createElement(FieldGroup, { label: "نوع القياس" }, /* @__PURE__ */ React.createElement("div", { className: "vital-type-grid", role: "radiogroup", "aria-label": "نوع القياس" }, VITAL_TYPES.map((t) => /* @__PURE__ */ React.createElement(
            "button",
            {
              type: "button",
              key: t.key,
              role: "radio",
              "aria-checked": type === t.key,
              className: type === t.key ? "vital-type-btn active" : "vital-type-btn",
              onClick: () => setType(t.key)
            },
            /* @__PURE__ */ React.createElement("span", { className: `icon-chip icon-chip-sm tone-${t.tone}`, "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(Icon, { name: t.icon, size: 21 })),
            /* @__PURE__ */ React.createElement("span", null, t.label)
          )))),
          type === "blood_pressure" ? /* @__PURE__ */ React.createElement(FieldGroup, { label: "الانقباضي / الانبساطي" }, /* @__PURE__ */ React.createElement("div", { className: "value-inputs" }, /* @__PURE__ */ React.createElement(
            "input",
            {
              type: "number",
              required: true,
              placeholder: "120",
              "aria-label": "الضغط الانقباضي",
              value: systolic,
              onChange: (e) => setSystolic(e.target.value)
            }
          ), /* @__PURE__ */ React.createElement(
            "input",
            {
              type: "number",
              required: true,
              placeholder: "80",
              "aria-label": "الضغط الانبساطي",
              value: diastolic,
              onChange: (e) => setDiastolic(e.target.value)
            }
          ))) : /* @__PURE__ */ React.createElement(Field, { label: `القيمة ${unitByType[type] ? `(${unitByType[type]})` : ""}` }, /* @__PURE__ */ React.createElement("input", { type: "number", required: true, value, onChange: (e) => setValue(e.target.value) })),
          /* @__PURE__ */ React.createElement(Field, { label: "وقت القياس" }, /* @__PURE__ */ React.createElement(
            "input",
            {
              type: "datetime-local",
              required: true,
              value: recordedAt,
              onChange: (e) => setRecordedAt(e.target.value)
            }
          ))
        );
      }
      /*! ===== js/components/Notifications.jsx ===== */
      const NOTIF_ICONS = {
        missed_dose: "warning",
        upcoming_appointment: "calendar",
        general: "bell",
        patient_issue: "alert"
      };
      function NotificationsView({ notifications, onRefresh }) {
        const [error, setError] = React.useState("");
        async function handleClick(n) {
          if (n.is_read) return;
          try {
            await api.markNotificationRead(n.id);
            onRefresh();
          } catch (e) {
            setError(e.message);
          }
        }
        async function handleReadAll() {
          try {
            await api.markAllNotificationsRead();
            onRefresh();
          } catch (e) {
            setError(e.message);
          }
        }
        const hasUnread = notifications.some((n) => !n.is_read);
        return /* @__PURE__ */ React.createElement("div", { className: "view" }, /* @__PURE__ */ React.createElement("div", { className: "view-header" }, /* @__PURE__ */ React.createElement("h2", { className: "view-title" }, "الإشعارات"), hasUnread && /* @__PURE__ */ React.createElement(Button, { variant: "ghost", onClick: handleReadAll }, "تعليم الكل كمقروء")), /* @__PURE__ */ React.createElement(Banner, { onClose: () => setError("") }, error), notifications.length === 0 ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "bell", text: "مفيش إشعارات لسه." }) : /* @__PURE__ */ React.createElement(Card, { className: "notif-list stagger" }, notifications.map((n) => /* @__PURE__ */ React.createElement(
          "div",
          {
            key: n.id,
            className: n.is_read ? "notif-item" : "notif-item unread",
            onClick: () => handleClick(n),
            role: "button",
            tabIndex: 0,
            onKeyDown: (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleClick(n);
              }
            },
            "aria-label": `${n.is_read ? "" : "غير مقروء: "}${n.message}، ${formatDateTime(n.created_at)}`
          },
          /* @__PURE__ */ React.createElement("span", { className: "notif-icon", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(Icon, { name: NOTIF_ICONS[n.type] || "bell", size: 23 })),
          /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "notif-message" }, n.message), /* @__PURE__ */ React.createElement("div", { className: "notif-date" }, formatDateTime(n.created_at)))
        ))));
      }
      /*! ===== js/components/Patients.jsx ===== */
      function buildAccessLink(token) {
        return `${window.location.origin}/access/${token}`;
      }
      function PatientsView({ patients, onChanged }) {
        const [error, setError] = React.useState("");
        const [showAddForm, setShowAddForm] = React.useState(false);
        const [showJoinForm, setShowJoinForm] = React.useState(false);
        const [newPatientLink, setNewPatientLink] = React.useState(null);
        return /* @__PURE__ */ React.createElement("div", { className: "view" }, /* @__PURE__ */ React.createElement("div", { className: "view-header" }, /* @__PURE__ */ React.createElement("h2", { className: "view-title" }, "المرضى اللي بتتابعهم"), /* @__PURE__ */ React.createElement(Button, { onClick: () => setShowAddForm(true) }, /* @__PURE__ */ React.createElement(Icon, { name: "plus", size: 20, strokeWidth: 2.4 }), "إضافة مريض جديد")), /* @__PURE__ */ React.createElement(Banner, { onClose: () => setError("") }, error), patients.length === 0 ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "users", text: "لسه معندكش مريض. ضيف أول واحد وابعتله اللينك." }) : /* @__PURE__ */ React.createElement("div", { className: "med-list stagger" }, patients.map((p) => /* @__PURE__ */ React.createElement(PatientCard, { key: p.id, patient: p, onError: setError, onChanged }))), /* @__PURE__ */ React.createElement(Card, null, /* @__PURE__ */ React.createElement("button", { className: "link-like", onClick: () => setShowJoinForm(true) }, "عندك كود مشاركة من مريض متابع بالفعل من حد تاني؟")), showAddForm && /* @__PURE__ */ React.createElement(
          AddPatientForm,
          {
            onClose: () => setShowAddForm(false),
            onCreated: (patient) => {
              setShowAddForm(false);
              setNewPatientLink(patient);
              onChanged();
            }
          }
        ), newPatientLink && /* @__PURE__ */ React.createElement(ShareLinkModal, { patient: newPatientLink, onClose: () => setNewPatientLink(null) }), showJoinForm && /* @__PURE__ */ React.createElement(
          JoinPatientForm,
          {
            onClose: () => setShowJoinForm(false),
            onJoined: () => {
              setShowJoinForm(false);
              onChanged();
            }
          }
        ));
      }
      function PatientCard({ patient, onError, onChanged }) {
        const [showShare, setShowShare] = React.useState(false);
        const [current, setCurrent] = React.useState(patient);
        const [regenerating, setRegenerating] = React.useState(false);
        async function handleRegenerate() {
          if (!confirm("اللينك القديم هيبقى مش شغال. متأكد؟")) return;
          setRegenerating(true);
          try {
            const data = await api.regeneratePatientLink(current.id);
            setCurrent(__spreadProps(__spreadValues({}, current), { access_token: data.access_token }));
            setShowShare(true);
          } catch (e) {
            onError(e.message);
          } finally {
            setRegenerating(false);
          }
        }
        return /* @__PURE__ */ React.createElement(Card, { className: "med-card" }, /* @__PURE__ */ React.createElement("div", { className: "med-main" }, /* @__PURE__ */ React.createElement("div", { className: "med-name" }, current.name), current.phone && /* @__PURE__ */ React.createElement("div", { className: "med-dosage" }, current.phone), current.link_code && /* @__PURE__ */ React.createElement("div", { className: "med-notes share-code-row" }, "كود المشاركة:", /* @__PURE__ */ React.createElement("span", { className: "share-code" }, current.link_code))), /* @__PURE__ */ React.createElement("div", { className: "med-actions patient-link-actions" }, /* @__PURE__ */ React.createElement(Button, { variant: "ghost", "aria-label": `عرض لينك دخول ${current.name}`, onClick: () => setShowShare(true) }, /* @__PURE__ */ React.createElement(Icon, { name: "link", size: 17 }), "لينك الدخول"), /* @__PURE__ */ React.createElement(
          Button,
          {
            variant: "ghost",
            "aria-label": `توليد لينك دخول جديد لـ ${current.name}`,
            onClick: handleRegenerate,
            disabled: regenerating
          },
          regenerating ? "..." : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(Icon, { name: "refresh", size: 17 }), "لينك جديد")
        )), showShare && /* @__PURE__ */ React.createElement(ShareLinkModal, { patient: current, onClose: () => setShowShare(false) }));
      }
      function ShareLinkModal({ patient, onClose }) {
        const [copied, setCopied] = React.useState(false);
        const [copyFailed, setCopyFailed] = React.useState(false);
        const link = buildAccessLink(patient.access_token);
        async function copyLink() {
          setCopyFailed(false);
          const ok = await copyText(link);
          if (ok) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2e3);
          } else {
            setCopyFailed(true);
          }
        }
        return /* @__PURE__ */ React.createElement(
          Modal,
          {
            icon: "link",
            tone: "primary",
            title: `لينك دخول ${patient.name}`,
            subtitle: "لينك واحد بيدخّل المريض على طول - من غير تسجيل ولا باسورد",
            onClose,
            footer: (close) => /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(Button, { type: "button", variant: "soft", onClick: close }, "تم"), /* @__PURE__ */ React.createElement(Button, { onClick: copyLink, variant: copied ? "accent" : "primary" }, /* @__PURE__ */ React.createElement(Icon, { name: copied ? "checkCircle" : "copy", size: 19 }), copied ? "اتنسخ" : "نسخ اللينك"))
          },
          /* @__PURE__ */ React.createElement("p", null, "ابعت اللينك ده لـ ", /* @__PURE__ */ React.createElement("strong", null, patient.name), " على واتساب أو أي رسالة. أول ما يدوس عليه هيدخل على طول جوه التطبيق، وهيلاقي كل حاجة انت جهزتهاله - من غير ما يعمل تسجيل أو يكتب أي باسورد."),
          /* @__PURE__ */ React.createElement("div", { className: "link-code-box" }, /* @__PURE__ */ React.createElement("a", { className: "share-link-text", href: link, target: "_blank", rel: "noopener noreferrer" }, link), copyFailed && /* @__PURE__ */ React.createElement("p", { className: "copy-hint" }, 'معرفناش ننسخه تلقائيًا (بيحصل لو بتفتح التطبيق بعنوان مش localhost). دوس مطوّل على اللينك فوق واختار "نسخ" يدويًا، أو ابعت الصفحة دي بنفسها.'))
        );
      }
      function AddPatientForm({ onClose, onCreated }) {
        const [name, setName] = React.useState("");
        const [phone, setPhone] = React.useState("");
        const [error, setError] = React.useState("");
        const [saving, setSaving] = React.useState(false);
        async function handleSubmit(e) {
          e.preventDefault();
          setSaving(true);
          setError("");
          try {
            const data = await api.createPatient({ name, phone: phone || void 0 });
            onCreated(data.patient);
          } catch (e2) {
            setError(e2.message);
          } finally {
            setSaving(false);
          }
        }
        return /* @__PURE__ */ React.createElement(
          Modal,
          {
            icon: "users",
            tone: "primary",
            title: "إضافة مريض جديد",
            subtitle: "هتاخد لينك دخول تبعتهوله، ويفتحه يلاقي كل حاجة جاهزة",
            onClose,
            onSubmit: handleSubmit,
            footer: (close) => /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(Button, { type: "button", variant: "soft", onClick: close, disabled: saving }, "إلغاء"), /* @__PURE__ */ React.createElement(Button, { type: "submit", loading: saving }, saving ? "جاري الإضافة..." : "إضافة المريض"))
          },
          /* @__PURE__ */ React.createElement(Banner, { onClose: () => setError("") }, error),
          /* @__PURE__ */ React.createElement(Field, { label: "اسم المريض" }, /* @__PURE__ */ React.createElement("input", { required: true, value: name, onChange: (e) => setName(e.target.value) })),
          /* @__PURE__ */ React.createElement(Field, { label: "رقم موبايل المريض (اختياري)" }, /* @__PURE__ */ React.createElement(
            "input",
            {
              type: "tel",
              inputMode: "numeric",
              value: phone,
              onChange: (e) => setPhone(e.target.value),
              placeholder: "01xxxxxxxxx"
            }
          ))
        );
      }
      function JoinPatientForm({ onClose, onJoined }) {
        const [code, setCode] = React.useState("");
        const [error, setError] = React.useState("");
        const [saving, setSaving] = React.useState(false);
        async function handleSubmit(e) {
          e.preventDefault();
          setSaving(true);
          setError("");
          try {
            await api.linkPatient(code.trim());
            onJoined();
          } catch (e2) {
            setError(e2.message);
          } finally {
            setSaving(false);
          }
        }
        return /* @__PURE__ */ React.createElement(
          Modal,
          {
            icon: "link",
            tone: "accent",
            title: "الانضمام كمتابع لمريض موجود",
            subtitle: "اطلب كود المشاركة من المتابع اللي ضاف المريض",
            onClose,
            onSubmit: handleSubmit,
            footer: (close) => /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(Button, { type: "button", variant: "soft", onClick: close, disabled: saving }, "إلغاء"), /* @__PURE__ */ React.createElement(Button, { type: "submit", loading: saving }, saving ? "جاري الانضمام..." : "انضمام"))
          },
          /* @__PURE__ */ React.createElement(Banner, { onClose: () => setError("") }, error),
          /* @__PURE__ */ React.createElement(Field, { label: "كود المشاركة" }, /* @__PURE__ */ React.createElement(
            "input",
            {
              required: true,
              className: "code-input",
              value: code,
              onChange: (e) => setCode(e.target.value.toUpperCase()),
              placeholder: "مثال: A1B2C3"
            }
          ))
        );
      }
      /*! ===== js/components/PatientHome.jsx ===== */
      function formatTimeObj(dateObj) {
        return dateObj.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
      }
      function ringDoseAlarm() {
        try {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (AudioCtx) {
            const ctx = new AudioCtx();
            [0, 0.5, 1, 1.5, 2].forEach((t) => {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = "sine";
              osc.frequency.value = 880;
              gain.gain.value = 0.3;
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.start(ctx.currentTime + t);
              osc.stop(ctx.currentTime + t + 0.3);
            });
            setTimeout(() => ctx.close(), 3e3);
          }
        } catch (e) {
        }
        if (navigator.vibrate) {
          navigator.vibrate([400, 200, 400, 200, 400, 200, 400]);
        }
      }
      const ISSUE_OPTIONS = [
        { key: "forgot_dose", icon: "clock", label: "نسيت آخد جرعة", tone: "blue" },
        { key: "med_finished", icon: "pill", label: "الدوا خلص", tone: "amber" },
        { key: "unclear_dose", icon: "question", label: "مش فاهم إزاي آخده", tone: "purple" },
        { key: "side_effect", icon: "unwell", label: "حاسس بتعب بعد الدوا", tone: "rose" },
        { key: "other", icon: "warning", label: "حاجة تانية", tone: "gray" },
        { key: "want_call", icon: "phone", label: "عايز حد يكلمني", tone: "danger", urgent: true }
      ];
      function PatientHome({
        user,
        onLogout,
        darkMode,
        onSetDarkMode,
        fontLarge,
        onSetFontLarge,
        autoNightScale,
        onToggleAutoNightScale,
        alarmEnabled,
        onToggleAlarmEnabled,
        installPrompt,
        onInstalled
      }) {
        const [doses, setDoses] = React.useState([]);
        const [loading, setLoading] = React.useState(true);
        const [error, setError] = React.useState("");
        const [showIssue, setShowIssue] = React.useState(false);
        const [showSettings, setShowSettings] = React.useState(false);
        const [caregivers, setCaregivers] = React.useState([]);
        const [now, setNow] = React.useState(() => /* @__PURE__ */ new Date());
        const [notifPermission, setNotifPermission] = React.useState(
          "Notification" in window ? Notification.permission : "unsupported"
        );
        const [notifHelpOpen, setNotifHelpOpen] = React.useState(false);
        const notifiedDoseIds = React.useRef(/* @__PURE__ */ new Set());
        const hasSeededDoses = React.useRef(false);
        function requestNotifPermission() {
          if (!("Notification" in window)) return;
          if (Notification.permission === "denied") {
            setNotifHelpOpen(true);
            return;
          }
          try {
            const result = Notification.requestPermission((perm) => setNotifPermission(perm));
            if (result && typeof result.then === "function") {
              result.then(setNotifPermission).catch(() => setNotifPermission(Notification.permission));
            }
          } catch (e) {
            setNotifPermission(Notification.permission);
          }
        }
        const load = React.useCallback(async () => {
          setLoading(true);
          try {
            const data = await api.getTodayDoses(user.id);
            setDoses(data.doses);
          } catch (e) {
            setError(e.message);
          } finally {
            setLoading(false);
          }
        }, [user.id]);
        React.useEffect(() => {
          load();
          const interval = setInterval(load, 6e4);
          return () => clearInterval(interval);
        }, [load]);
        React.useEffect(() => {
          api.getCaregivers(user.id).then((data) => setCaregivers(data.caregivers || [])).catch(() => {
          });
        }, [user.id]);
        React.useEffect(() => {
          const tick = setInterval(() => setNow(/* @__PURE__ */ new Date()), 15e3);
          return () => clearInterval(tick);
        }, []);
        React.useEffect(() => {
          const isFirstPass = !hasSeededDoses.current;
          doses.forEach((d) => {
            if (d.status !== "pending") return;
            if (parseCairoDatetime(d.scheduled_at) > now) return;
            if (notifiedDoseIds.current.has(d.id)) return;
            notifiedDoseIds.current.add(d.id);
            if (isFirstPass) return;
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification("معاك - وقت الدوا 💊", {
                body: `وقت ${d.name} دلوقتي`,
                tag: `dose-${d.id}`
              });
            }
            if (alarmEnabled) ringDoseAlarm();
          });
          if (isFirstPass && doses.length) hasSeededDoses.current = true;
        }, [doses, now, alarmEnabled]);
        async function handleTake(doseId) {
          try {
            await api.takeDose(doseId);
            load();
          } catch (e) {
            setError(e.message);
          }
        }
        function speak(text) {
          try {
            if (!("speechSynthesis" in window)) return;
            const u = new SpeechSynthesisUtterance(text);
            u.lang = "ar-SA";
            u.rate = 0.95;
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(u);
          } catch (e) {
          }
        }
        const isNightBoost = autoNightScale && (now.getHours() >= 19 || now.getHours() < 6);
        const done = doses.filter((d) => d.status !== "pending");
        const medicationNames = [...new Set(doses.map((d) => d.name))];
        const firstName = (user.name || "").trim().split(" ")[0] || user.name;
        const dosesWithAvailability = doses.map((d) => {
          if (d.status !== "pending") return __spreadProps(__spreadValues({}, d), { isOpen: false, isLocked: false });
          const { isEarly, availableFrom } = getDoseAvailability(d.scheduled_at, now);
          return __spreadProps(__spreadValues({}, d), { isOpen: !isEarly, isLocked: isEarly, availableFrom });
        });
        const openDoses = dosesWithAvailability.filter((d) => d.isOpen);
        const lockedDoses = dosesWithAvailability.filter((d) => d.isLocked);
        const heroDose = openDoses[0] || null;
        const waitingDose = !heroDose ? lockedDoses[0] || null : null;
        const heroKind = heroDose ? "open" : waitingDose ? "waiting" : doses.length > 0 ? "allDone" : "empty";
        const heroId = heroDose ? heroDose.id : waitingDose ? waitingDose.id : null;
        const secondaryDoses = dosesWithAvailability.filter((d) => d.id !== heroId);
        function speakDoseInfo() {
          let text;
          if (heroKind === "open") {
            text = "معاد " + heroDose.name + " دلوقتي" + (heroDose.dosage ? "، الجرعة " + heroDose.dosage : "") + ". دوس على زرار خدت الدوا بعد ما تاخده.";
          } else if (heroKind === "waiting") {
            text = "الجرعة الجاية " + waitingDose.name + " الساعة " + formatTimeObj(waitingDose.availableFrom) + ".";
          } else {
            text = "خلصت كل جرعات النهارده، مفيش حاجة عليك دلوقتي.";
          }
          speak(text);
        }
        function doseDotStatus(d) {
          if (d.status === "taken") return "taken";
          if (d.status === "missed") return "missed";
          if (d.isOpen) return "open";
          return "locked";
        }
        function secondaryIcon(d) {
          if (d.status === "taken") return "checkCircle";
          if (d.status === "missed") return "warning";
          if (d.isLocked) return "clock";
          return "pill";
        }
        function secondaryMeta(d) {
          if (d.status === "taken") return `اتاخدت - ${formatTime(d.scheduled_at)}`;
          if (d.status === "missed") return `فاتت - ${formatTime(d.scheduled_at)}`;
          if (d.isLocked) return `هتفتح الساعة ${formatTimeObj(d.availableFrom)}`;
          return `الساعة ${formatTime(d.scheduled_at)}`;
        }
        const rootClassName = `patient-home${fontLarge ? " font-large" : ""}${isNightBoost ? " font-night" : ""}`;
        return /* @__PURE__ */ React.createElement("div", { className: `${rootClassName} ambient` }, /* @__PURE__ */ React.createElement("header", { className: "patient-header" }, /* @__PURE__ */ React.createElement("span", { className: "patient-greeting" }, "أهلاً ", firstName), /* @__PURE__ */ React.createElement("div", { className: "patient-header-actions" }, /* @__PURE__ */ React.createElement(
          "button",
          {
            className: "patient-settings-btn",
            onClick: () => setShowSettings(true),
            "aria-label": "الإعدادات",
            title: "الإعدادات"
          },
          /* @__PURE__ */ React.createElement(Icon, { name: "settings", size: 22 })
        ), /* @__PURE__ */ React.createElement("button", { className: "patient-logout", onClick: onLogout }, "خروج"))), /* @__PURE__ */ React.createElement("main", { className: "patient-main" }, /* @__PURE__ */ React.createElement(Banner, { onClose: () => setError("") }, error), /* @__PURE__ */ React.createElement(InstallBanner, { deferredPrompt: installPrompt, onInstalled }), loading ? /* @__PURE__ */ React.createElement(Spinner, null) : doses.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "patient-empty" }, /* @__PURE__ */ React.createElement("div", { className: "patient-empty-icon" }, /* @__PURE__ */ React.createElement(Icon, { name: "inbox", size: 58, strokeWidth: 1.5 })), /* @__PURE__ */ React.createElement("p", null, "معندكش أدوية دلوقتي")) : /* @__PURE__ */ React.createElement("div", { className: "patient-today" }, /* @__PURE__ */ React.createElement("div", { className: "patient-progress-dots" }, dosesWithAvailability.map((d) => /* @__PURE__ */ React.createElement(
          "span",
          {
            key: d.id,
            className: `progress-dot progress-dot-${doseDotStatus(d)}${d.id === heroId && heroKind === "open" ? " progress-dot-active" : ""}`
          }
        ))), /* @__PURE__ */ React.createElement("div", { className: "patient-progress-label" }, done.length, " من ", doses.length, " جرعات خلصت"), heroKind === "open" && /* @__PURE__ */ React.createElement("div", { className: "patient-hero-card patient-hero-open" }, /* @__PURE__ */ React.createElement("button", { className: "patient-hero-speak", onClick: speakDoseInfo, title: "اسمع الدواء", "aria-label": "اسمع الدواء" }, /* @__PURE__ */ React.createElement(Icon, { name: "speaker", size: 24 })), /* @__PURE__ */ React.createElement("div", { className: "patient-hero-label" }, "دلوقتي"), /* @__PURE__ */ React.createElement("div", { className: "patient-hero-icon", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(Icon, { name: "pill", size: 56, strokeWidth: 1.7 })), /* @__PURE__ */ React.createElement("div", { className: "patient-hero-name" }, heroDose.name), /* @__PURE__ */ React.createElement("div", { className: "patient-hero-meta" }, "الساعة ", formatTime(heroDose.scheduled_at)), heroDose.dosage && /* @__PURE__ */ React.createElement("div", { className: "patient-hero-meta" }, heroDose.dosage), /* @__PURE__ */ React.createElement("button", { className: "patient-hero-btn", onClick: () => handleTake(heroDose.id) }, /* @__PURE__ */ React.createElement(Icon, { name: "check", size: 30, strokeWidth: 2.6 }), "خدت الدوا")), heroKind === "waiting" && /* @__PURE__ */ React.createElement("div", { className: "patient-hero-card patient-hero-waiting" }, /* @__PURE__ */ React.createElement("button", { className: "patient-hero-speak", onClick: speakDoseInfo, title: "اسمع الدواء", "aria-label": "اسمع الدواء" }, /* @__PURE__ */ React.createElement(Icon, { name: "speaker", size: 24 })), /* @__PURE__ */ React.createElement("div", { className: "patient-hero-label muted" }, "الجرعة الجاية"), /* @__PURE__ */ React.createElement("div", { className: "patient-hero-icon", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(Icon, { name: "clock", size: 48, strokeWidth: 1.6 })), /* @__PURE__ */ React.createElement("div", { className: "patient-hero-name" }, waitingDose.name), /* @__PURE__ */ React.createElement("div", { className: "patient-hero-meta" }, "هتقدر تأكدها الساعة ", formatTimeObj(waitingDose.availableFrom))), heroKind === "allDone" && /* @__PURE__ */ React.createElement("div", { className: "patient-hero-card patient-hero-alldone" }, /* @__PURE__ */ React.createElement("div", { className: "patient-hero-icon", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(Icon, { name: "sparkles", size: 54, strokeWidth: 1.7 })), /* @__PURE__ */ React.createElement("div", { className: "patient-hero-name" }, "خلصت كل جرعات النهارده")), secondaryDoses.length > 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "patient-secondary-title" }, "باقي جرعات النهارده"), /* @__PURE__ */ React.createElement("div", { className: "patient-secondary-list stagger" }, secondaryDoses.map((d) => /* @__PURE__ */ React.createElement("div", { key: d.id, className: `patient-secondary-row status-${d.status}` }, /* @__PURE__ */ React.createElement("span", { className: "patient-secondary-icon", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(Icon, { name: secondaryIcon(d), size: 24 })), /* @__PURE__ */ React.createElement("div", { className: "patient-secondary-body" }, /* @__PURE__ */ React.createElement("div", { className: "patient-secondary-name" }, d.name), /* @__PURE__ */ React.createElement("div", { className: "patient-secondary-meta" }, secondaryMeta(d))), d.isOpen && /* @__PURE__ */ React.createElement("button", { className: "patient-secondary-take", onClick: () => handleTake(d.id) }, /* @__PURE__ */ React.createElement(Icon, { name: "check", size: 17, strokeWidth: 2.6 }), "خدت")))))), caregivers.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "patient-caregiver-card" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "patient-caregiver-label" }, "متابعك"), /* @__PURE__ */ React.createElement("div", { className: "patient-caregiver-name" }, caregivers[0].name, caregivers.length > 1 && ` +${caregivers.length - 1} كمان`)), /* @__PURE__ */ React.createElement("div", { className: "patient-caregiver-avatar", "aria-hidden": "true" }, caregivers[0].name.trim()[0] || "م")), isNightBoost && /* @__PURE__ */ React.createElement("div", { className: "patient-night-banner" }, /* @__PURE__ */ React.createElement(Icon, { name: "moon", size: 20 }), /* @__PURE__ */ React.createElement("span", null, "وضع الليل: الخط أكبر شوية عشان الرؤية بالليل")), notifPermission !== "granted" && notifPermission !== "unsupported" && /* @__PURE__ */ React.createElement("div", { className: `patient-notif-banner${notifPermission === "denied" ? " patient-notif-banner-denied" : ""}` }, /* @__PURE__ */ React.createElement(Icon, { name: notifPermission === "denied" ? "bellOff" : "bell", size: 26 }), /* @__PURE__ */ React.createElement("div", { className: "patient-notif-text" }, notifPermission === "denied" ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", null, "التنبيهات موقوفة من إعدادات المتصفح"), notifHelpOpen && /* @__PURE__ */ React.createElement("div", { className: "patient-notif-help" }, 'افتح إعدادات الموقع من المتصفح (دوس على علامة القفل جنب عنوان الموقع فوق) وفعّل "الإشعارات" من هناك، بعدين ارجع للتطبيق.')) : "فعّل التنبيهات عشان التطبيق يرن ويفكّرك بمواعيد دوائك"), /* @__PURE__ */ React.createElement(
          "button",
          {
            className: "patient-notif-btn",
            onClick: notifPermission === "denied" ? () => setNotifHelpOpen((v) => !v) : requestNotifPermission
          },
          notifPermission === "denied" ? notifHelpOpen ? "تمام" : "إزاي؟" : "تفعيل"
        ))), /* @__PURE__ */ React.createElement("button", { className: "patient-issue-btn", onClick: () => setShowIssue(true) }, /* @__PURE__ */ React.createElement(Icon, { name: "alert", size: 28, strokeWidth: 2.3 }), "حصلت مشكلة؟"), showIssue && /* @__PURE__ */ React.createElement(
          IssueSheet,
          {
            patientId: user.id,
            medications: medicationNames,
            onClose: () => setShowIssue(false)
          }
        ), showSettings && /* @__PURE__ */ React.createElement(
          SettingsSheet,
          {
            darkMode,
            onSetDarkMode,
            fontLarge,
            onSetFontLarge,
            autoNightScale,
            onToggleAutoNightScale,
            alarmEnabled,
            onToggleAlarmEnabled,
            notifPermission,
            onRequestNotifPermission: requestNotifPermission,
            showPatientOptions: true,
            onClose: () => setShowSettings(false)
          }
        ));
      }
      function IssueSheet({ patientId, medications, onClose }) {
        const [step, setStep] = React.useState("menu");
        const [sending, setSending] = React.useState(false);
        const [error, setError] = React.useState("");
        async function send(issueType, medicationName) {
          setSending(true);
          setError("");
          try {
            await api.reportIssue(patientId, issueType, medicationName);
            setStep("sent");
            setTimeout(onClose, 2500);
          } catch (e) {
            setError(e.message);
            setSending(false);
          }
        }
        function handlePick(key) {
          if (key === "med_finished" && medications.length > 1) {
            setStep("pick-med");
            return;
          }
          send(key, key === "med_finished" ? medications[0] : void 0);
        }
        return /* @__PURE__ */ React.createElement("div", { className: "issue-overlay", onClick: step === "sent" ? void 0 : onClose }, /* @__PURE__ */ React.createElement("div", { className: "issue-sheet", onClick: (e) => e.stopPropagation() }, step !== "sent" && /* @__PURE__ */ React.createElement("div", { className: "issue-sheet-handle", "aria-hidden": "true" }), step === "sent" ? /* @__PURE__ */ React.createElement("div", { className: "issue-sent" }, /* @__PURE__ */ React.createElement("div", { className: "issue-sent-icon", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(Icon, { name: "check", size: 46, strokeWidth: 2.6 })), /* @__PURE__ */ React.createElement("p", null, "تمام، وصل خبر لـ اللي بيتابعك")) : step === "pick-med" ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("h3", { className: "issue-title" }, "أنهي دوا خلص؟"), /* @__PURE__ */ React.createElement(Banner, { onClose: () => setError("") }, error), /* @__PURE__ */ React.createElement("div", { className: "issue-grid" }, medications.map((m) => /* @__PURE__ */ React.createElement(
          "button",
          {
            key: m,
            className: "issue-option",
            disabled: sending,
            onClick: () => send("med_finished", m)
          },
          /* @__PURE__ */ React.createElement("span", { className: "issue-option-icon tone-amber", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(Icon, { name: "pill", size: 30, strokeWidth: 1.8 })),
          /* @__PURE__ */ React.createElement("span", null, m)
        ))), /* @__PURE__ */ React.createElement("button", { className: "issue-back", onClick: () => setStep("menu"), disabled: sending }, "رجوع")) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("h3", { className: "issue-title" }, "حصل إيه؟"), /* @__PURE__ */ React.createElement("p", { className: "issue-subtitle" }, "اختار اللي حصلك، هيوصل خبر فورًا لمتابعك"), /* @__PURE__ */ React.createElement(Banner, { onClose: () => setError("") }, error), /* @__PURE__ */ React.createElement("div", { className: "issue-grid stagger" }, ISSUE_OPTIONS.map((opt) => /* @__PURE__ */ React.createElement(
          "button",
          {
            key: opt.key,
            className: `issue-option${opt.urgent ? " issue-option-urgent" : ""}`,
            disabled: sending,
            onClick: () => handlePick(opt.key)
          },
          /* @__PURE__ */ React.createElement("span", { className: `issue-option-icon tone-${opt.tone}`, "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(Icon, { name: opt.icon, size: 30, strokeWidth: 1.8 })),
          /* @__PURE__ */ React.createElement("span", null, opt.label)
        ))), /* @__PURE__ */ React.createElement("button", { className: "issue-close", onClick: onClose, disabled: sending }, "إلغاء"))));
      }
      /*! ===== js/app.jsx ===== */
      document.addEventListener(
        "invalid",
        (e) => {
          const el = e.target;
          if (typeof el.setCustomValidity !== "function") return;
          const v = el.validity;
          if (v.valueMissing) el.setCustomValidity("لازم تملأ الحقل ده");
          else if (v.typeMismatch && el.type === "email") el.setCustomValidity("اكتب إيميل صحيح");
          else if (v.typeMismatch) el.setCustomValidity("الصيغة دي مش صحيحة");
          else if (v.tooShort) el.setCustomValidity(`لازم يكون ${el.minLength} حروف على الأقل`);
          else if (v.tooLong) el.setCustomValidity(`أقصى حاجة ${el.maxLength} حرف`);
          else if (v.rangeUnderflow) el.setCustomValidity(`القيمة لازم تكون ${el.min} على الأقل`);
          else if (v.rangeOverflow) el.setCustomValidity(`القيمة لازم تكون ${el.max} على الأكتر`);
          else if (v.patternMismatch) el.setCustomValidity("الصيغة دي مش صحيحة");
          else el.setCustomValidity("القيمة دي مش صحيحة");
        },
        true
      );
      document.addEventListener(
        "input",
        (e) => {
          if (typeof e.target.setCustomValidity === "function") e.target.setCustomValidity("");
        },
        true
      );
      function readBoolPref(key, fallback) {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : raw === "1";
      }
      function writeBoolPref(key, value) {
        localStorage.setItem(key, value ? "1" : "0");
      }
      function App() {
        const [user, setUser] = React.useState(null);
        const [booting, setBooting] = React.useState(true);
        const [patients, setPatients] = React.useState([]);
        const [activePatientId, setActivePatientId] = React.useState(null);
        const [view, setView] = React.useState("today");
        const [notifications, setNotifications] = React.useState([]);
        const [accessError, setAccessError] = React.useState("");
        const notifiedDoseIds = React.useRef(/* @__PURE__ */ new Set());
        const hasSeededDosesRef = React.useRef(false);
        const notifiedIssueIds = React.useRef(/* @__PURE__ */ new Set());
        const hasSeededIssues = React.useRef(false);
        const [installPrompt, setInstallPrompt] = React.useState(null);
        React.useEffect(() => {
          function onBeforeInstallPrompt(e) {
            e.preventDefault();
            setInstallPrompt(e);
          }
          function onAppInstalled() {
            setInstallPrompt(null);
          }
          window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
          window.addEventListener("appinstalled", onAppInstalled);
          return () => {
            window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
            window.removeEventListener("appinstalled", onAppInstalled);
          };
        }, []);
        const [showSettings, setShowSettings] = React.useState(false);
        const [darkMode, setDarkMode] = React.useState(
          () => readBoolPref("ma3ak_dark", window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches)
        );
        const [fontLarge, setFontLarge] = React.useState(() => readBoolPref("ma3ak_font_large", false));
        const [autoNightScale, setAutoNightScale] = React.useState(() => readBoolPref("ma3ak_auto_night", true));
        const [alarmEnabled, setAlarmEnabled] = React.useState(() => readBoolPref("ma3ak_alarm", true));
        React.useEffect(() => {
          document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
          writeBoolPref("ma3ak_dark", darkMode);
        }, [darkMode]);
        React.useEffect(() => {
          document.documentElement.setAttribute("data-font", fontLarge ? "large" : "normal");
          writeBoolPref("ma3ak_font_large", fontLarge);
        }, [fontLarge]);
        React.useEffect(() => writeBoolPref("ma3ak_auto_night", autoNightScale), [autoNightScale]);
        React.useEffect(() => writeBoolPref("ma3ak_alarm", alarmEnabled), [alarmEnabled]);
        React.useEffect(() => {
          (async () => {
            const accessMatch = window.location.pathname.match(/^\/access\/([a-zA-Z0-9]+)\/?$/);
            if (accessMatch) {
              window.history.replaceState({}, "", "/");
              try {
                const data = await api.accessViaToken(accessMatch[1]);
                setToken(data.token);
                await onAuthenticated(data.user);
              } catch (e) {
                setToken(null);
                setAccessError(e.message || "اللينك ده مش شغال");
              }
              setBooting(false);
              return;
            }
            const token = getToken();
            if (!token) {
              setBooting(false);
              return;
            }
            try {
              const data = await api.me();
              await onAuthenticated(data.user);
            } catch (e) {
              setToken(null);
            } finally {
              setBooting(false);
            }
          })();
        }, []);
        async function onAuthenticated(u) {
          setUser(u);
          const data = await api.getPatients();
          setPatients(data.patients);
          if (data.patients.length) {
            setActivePatientId(data.patients[0].id);
          } else if (u.role === "caregiver") {
            setView("patients");
          }
        }
        function handleLogout() {
          setToken(null);
          setUser(null);
          setPatients([]);
          setActivePatientId(null);
          setNotifications([]);
          setView("today");
        }
        const refreshPatients = React.useCallback(async () => {
          const data = await api.getPatients();
          setPatients(data.patients);
          if (data.patients.length && !activePatientId) {
            setActivePatientId(data.patients[0].id);
          }
          return data.patients;
        }, [activePatientId]);
        const refreshNotifications = React.useCallback(async () => {
          if (!user) return;
          try {
            const data = await api.getNotifications();
            const unreadIssues = data.notifications.filter(
              (n) => n.type === "patient_issue" && !n.is_read
            );
            if (!hasSeededIssues.current) {
              unreadIssues.forEach((n) => notifiedIssueIds.current.add(n.id));
              hasSeededIssues.current = true;
            } else {
              unreadIssues.forEach((n) => {
                if (notifiedIssueIds.current.has(n.id)) return;
                notifiedIssueIds.current.add(n.id);
                if ("Notification" in window && Notification.permission === "granted") {
                  new Notification("معاك - مشكلة من مريض", { body: n.message });
                }
              });
            }
            setNotifications(data.notifications);
          } catch (e) {
          }
        }, [user]);
        React.useEffect(() => {
          if (!user) return;
          refreshNotifications();
          const interval = setInterval(refreshNotifications, 6e4);
          return () => clearInterval(interval);
        }, [user, refreshNotifications]);
        async function handleDismissIssue(id) {
          try {
            await api.markNotificationRead(id);
            refreshNotifications();
          } catch (e) {
          }
        }
        React.useEffect(() => {
          if (!user || !activePatientId) return;
          if ("Notification" in window && Notification.permission === "default") {
            Notification.requestPermission();
          }
          hasSeededDosesRef.current = false;
          const check = async () => {
            try {
              const data = await api.getTodayDoses(activePatientId);
              const now = /* @__PURE__ */ new Date();
              const isFirstPass = !hasSeededDosesRef.current;
              data.doses.forEach((d) => {
                if (d.status !== "pending") return;
                const scheduled = parseCairoDatetime(d.scheduled_at);
                if (scheduled <= now && !notifiedDoseIds.current.has(d.id)) {
                  notifiedDoseIds.current.add(d.id);
                  if (isFirstPass) return;
                  if ("Notification" in window && Notification.permission === "granted") {
                    new Notification("معاك - معاد دوا", { body: `معاد ${d.name} دلوقتي` });
                  }
                }
              });
              if (isFirstPass && data.doses.length) hasSeededDosesRef.current = true;
            } catch (e) {
            }
          };
          check();
          const interval = setInterval(check, 6e4);
          return () => clearInterval(interval);
        }, [user, activePatientId]);
        if (booting) {
          return /* @__PURE__ */ React.createElement("div", { className: "boot-screen" }, /* @__PURE__ */ React.createElement("div", { className: "boot-logo", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(Icon, { name: "brand", size: 46, strokeWidth: 1.7 })), /* @__PURE__ */ React.createElement("div", { className: "boot-name" }, "معاك"), /* @__PURE__ */ React.createElement(Spinner, null));
        }
        if (!user) {
          return /* @__PURE__ */ React.createElement(AuthScreen, { onAuthenticated, initialError: accessError });
        }
        if (user.role === "patient") {
          return /* @__PURE__ */ React.createElement(
            PatientHome,
            {
              user,
              onLogout: handleLogout,
              darkMode,
              onSetDarkMode: setDarkMode,
              fontLarge,
              onSetFontLarge: setFontLarge,
              autoNightScale,
              onToggleAutoNightScale: () => setAutoNightScale((v) => !v),
              alarmEnabled,
              onToggleAlarmEnabled: () => setAlarmEnabled((v) => !v),
              installPrompt,
              onInstalled: () => setInstallPrompt(null)
            }
          );
        }
        const unreadCount = notifications.filter((n) => !n.is_read).length;
        const issueAlerts = notifications.filter((n) => n.type === "patient_issue" && !n.is_read);
        let content;
        if (view === "today") content = /* @__PURE__ */ React.createElement(TodayView, { patientId: activePatientId });
        else if (view === "medications") content = /* @__PURE__ */ React.createElement(MedicationsView, { patientId: activePatientId });
        else if (view === "appointments") content = /* @__PURE__ */ React.createElement(AppointmentsView, { patientId: activePatientId });
        else if (view === "vitals") content = /* @__PURE__ */ React.createElement(VitalsView, { patientId: activePatientId });
        else if (view === "notifications")
          content = /* @__PURE__ */ React.createElement(NotificationsView, { notifications, onRefresh: refreshNotifications });
        else if (view === "patients")
          content = /* @__PURE__ */ React.createElement(PatientsView, { patients, onChanged: refreshPatients });
        return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
          AppLayout,
          {
            user,
            patients,
            activePatientId,
            onSwitchPatient: setActivePatientId,
            view,
            onChangeView: setView,
            onLogout: handleLogout,
            unreadCount,
            issueAlerts,
            onDismissIssue: handleDismissIssue,
            onOpenSettings: () => setShowSettings(true)
          },
          /* @__PURE__ */ React.createElement(InstallBanner, { deferredPrompt: installPrompt, onInstalled: () => setInstallPrompt(null) }),
          content
        ), showSettings && /* @__PURE__ */ React.createElement(
          SettingsSheet,
          {
            darkMode,
            onSetDarkMode: setDarkMode,
            fontLarge,
            onSetFontLarge: setFontLarge,
            showPatientOptions: false,
            onClose: () => setShowSettings(false)
          }
        ));
      }
      const root = ReactDOM.createRoot(document.getElementById("root"));
      root.render(/* @__PURE__ */ React.createElement(App, null));
    }
  });
  require_stdin();
})();
