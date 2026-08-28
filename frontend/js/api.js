/* ============================================
   MA3ak (معاك) - API client
   كل رد من السيرفر بييجي JSON، وده اللي بنتعامل معاه هنا
   ============================================ */

const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('ma3ak_token');
}

function setToken(token) {
  if (token) localStorage.setItem('ma3ak_token', token);
  else localStorage.removeItem('ma3ak_token');
}

/* ---------- لينك دخول المريض ----------
   المريض بيدخل بلينك سري مالوش باسورد. قبل كده اللينك ده كان بيتستخدم مرة
   واحدة وقت الدخول وبيتمسح من شريط العنوان وبيضيع - يعني أول ما توكن الجلسة
   ينتهي، المريض بيلاقي شاشة تسجيل دخول بتطلب موبايل وباسورد **مالوش أي معنى
   بالنسبة له**، ومفيش قدامه غير إنه يكلّم ابنه يبعتله اللينك من الأول.

   دلوقتي بنحتفظ باللينك على الجهاز ونجدّد الجلسة منه في صمت.

   على فكرة الأمان: ده مش تنازل. اللينك أصلاً كان في شريط العنوان وفي تاريخ
   المتصفح، وتوكن الجلسة نفسه محفوظ في نفس المكان بالظبط. والإلغاء الحقيقي
   بيحصل من "توليد لينك جديد" عند المتابع - وهو بيبطّل المخزّن ده فورًا. */
function getAccessToken() {
  return localStorage.getItem('ma3ak_access');
}

function setAccessToken(token) {
  if (token) localStorage.setItem('ma3ak_access', token);
  else localStorage.removeItem('ma3ak_access');
}

/* طلب تجديد واحد بس في نفس الوقت. من غير الحارس ده، لو 4 طلبات رجعوا 401
   مع بعض (وده بيحصل: الشاشة بتحمّل جرعات ومتابعين وإشعارات سوا)، كانوا
   هيبعتوا 4 طلبات تجديد - وحد المحاولات على /auth/access هيقفلهم كلهم. */
let refreshInFlight = null;

async function refreshSessionFromAccessLink() {
  if (refreshInFlight) return refreshInFlight;
  const accessToken = getAccessToken();
  if (!accessToken) return null;

  refreshInFlight = (async () => {
    try {
      const data = await rawRequest('/auth/access', { method: 'POST', body: { token: accessToken } });
      setToken(data.token);
      return data;
    } catch (e) {
      // اللينك مبقاش شغال (المتابع ولّد واحد جديد) - مفيش فايدة من الاحتفاظ بيه
      setAccessToken(null);
      setToken(null);
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function rawRequest(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    /* رد فاضي، مفيش مشكلة */
  }

  if (!res.ok) {
    const message = (data && data.error) || 'حصل خطأ غير متوقع';
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  return data;
}

async function apiRequest(path, options = {}) {
  try {
    return await rawRequest(path, options);
  } catch (e) {
    /* 401 + عندنا لينك دخول محفوظ = الجلسة خلصت بس المستخدم لسه له حق الدخول.
       بنجدّد في صمت ونعيد الطلب مرة واحدة. المريض ما يشوفش أي حاجة. */
    if (e.status !== 401 || path === '/auth/access' || !getAccessToken()) throw e;
    const refreshed = await refreshSessionFromAccessLink();
    if (!refreshed) throw e;
    return rawRequest(path, options);
  }
}

const api = {
  register: (payload) => apiRequest('/auth/register', { method: 'POST', body: payload }),
  login: (identifier, password) =>
    apiRequest('/auth/login', { method: 'POST', body: { identifier, password } }),
  accessViaToken: (token) => apiRequest('/auth/access', { method: 'POST', body: { token } }),
  me: () => apiRequest('/auth/me'),
  changePassword: (currentPassword, newPassword) =>
    apiRequest('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } }),
  recoverPassword: (phone, recoveryCode, newPassword) =>
    apiRequest('/auth/recover', { method: 'POST', body: { phone, recoveryCode, newPassword } }),

  createPatient: (payload) => apiRequest('/patients', { method: 'POST', body: payload }),
  linkPatient: (code) => apiRequest('/patients/link', { method: 'POST', body: { code } }),
  regeneratePatientLink: (id) => apiRequest(`/patients/${id}/regenerate-link`, { method: 'POST' }),
  reportIssue: (patientId, issueType, medicationName) =>
    apiRequest(`/patients/${patientId}/report-issue`, {
      method: 'POST',
      body: { issueType, medicationName },
    }),
  getPatients: () => apiRequest('/patients'),
  getCaregivers: (patientId) => apiRequest(`/patients/${patientId}/caregivers`),
  removeCaregiver: (patientId, caregiverId) =>
    apiRequest(`/patients/${patientId}/caregivers/${caregiverId}`, { method: 'DELETE' }),
  leavePatient: (patientId) => apiRequest(`/patients/${patientId}/link`, { method: 'DELETE' }),
  deletePatient: (patientId) => apiRequest(`/patients/${patientId}`, { method: 'DELETE' }),
  getPatientNotificationStatus: (patientId) =>
    apiRequest(`/patients/${patientId}/notification-status`),
  testPatientAlarm: (patientId) => apiRequest(`/patients/${patientId}/test-alarm`, { method: 'POST' }),
  getAdherence: (patientId, days) => apiRequest(`/patients/${patientId}/adherence?days=${days || 30}`),

  getMedications: (patientId) => apiRequest(`/medications?patientId=${patientId}`),
  getTodayDoses: (patientId) => apiRequest(`/medications/${patientId}/today`),
  addMedication: (payload) => apiRequest('/medications', { method: 'POST', body: payload }),
  updateMedication: (id, payload) => apiRequest(`/medications/${id}`, { method: 'PUT', body: payload }),
  deleteMedication: (id) => apiRequest(`/medications/${id}`, { method: 'DELETE' }),
  takeDose: (id) => apiRequest(`/doses/${id}/take`, { method: 'POST' }),
  snoozeDose: (id) => apiRequest(`/doses/${id}/snooze`, { method: 'POST' }),
  getDoses: (patientId, from, to) =>
    apiRequest(`/doses?patientId=${patientId}${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`),

  getMedicationImage: (id) => apiRequest(`/medications/${id}/image`),
  setMedicationImage: (id, dataUrl) => {
    // بنفصل نوع الصورة عن بياناتها هنا مرة واحدة، بدل ما كل مكان بيرفع صورة
    // يفتكر يعمل كده - السيرفر بيرفض أي حاجة مش base64 نضيف
    const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '');
    if (!match) throw new Error('الصورة مش مقروءة');
    return apiRequest(`/medications/${id}/image`, {
      method: 'PUT',
      body: { mime: match[1], data: match[2] },
    });
  },
  deleteMedicationImage: (id) => apiRequest(`/medications/${id}/image`, { method: 'DELETE' }),

  getAppointments: (patientId) => apiRequest(`/appointments?patientId=${patientId}`),
  addAppointment: (payload) => apiRequest('/appointments', { method: 'POST', body: payload }),
  updateAppointment: (id, payload) => apiRequest(`/appointments/${id}`, { method: 'PUT', body: payload }),
  deleteAppointment: (id) => apiRequest(`/appointments/${id}`, { method: 'DELETE' }),

  getVitals: (patientId, type) =>
    apiRequest(`/vitals?patientId=${patientId}${type ? `&type=${type}` : ''}`),
  addVital: (payload) => apiRequest('/vitals', { method: 'POST', body: payload }),
  deleteVital: (id) => apiRequest(`/vitals/${id}`, { method: 'DELETE' }),

  /* since = آخر إشعار الواجهة شايفاه. بيخلي الرد فاضي في الحالة الطبيعية بدل
     ما نجيب 50 صف كاملين كل دقيقة لكل مستخدم - فرق حقيقي على بيانات الموبايل
     البطيئة اللي أغلب مستخدمينا عليها. */
  getNotifications: (since) =>
    apiRequest(`/notifications${since ? `?since=${since}` : ''}`),
  markNotificationRead: (id) => apiRequest(`/notifications/${id}/read`, { method: 'POST' }),
  markNotificationHandled: (id) => apiRequest(`/notifications/${id}/handled`, { method: 'POST' }),
  markAllNotificationsRead: () => apiRequest('/notifications/read-all', { method: 'POST' }),
  getNotificationPrefs: () => apiRequest('/notifications/prefs'),
  updateNotificationPrefs: (payload) =>
    apiRequest('/notifications/prefs', { method: 'PUT', body: payload }),

  getPushPublicKey: () => apiRequest('/push/public-key'),
  subscribePush: (subscription) =>
    apiRequest('/push/subscribe', { method: 'POST', body: subscription }),
  unsubscribePush: (endpoint) =>
    apiRequest('/push/unsubscribe', { method: 'POST', body: { endpoint } }),
  sendTestPush: () => apiRequest('/push/test', { method: 'POST' }),
};
