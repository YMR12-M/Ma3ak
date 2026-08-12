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

async function apiRequest(path, { method = 'GET', body } = {}) {
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
    throw new Error(message);
  }
  return data;
}

const api = {
  register: (payload) => apiRequest('/auth/register', { method: 'POST', body: payload }),
  login: (identifier, password) =>
    apiRequest('/auth/login', { method: 'POST', body: { identifier, password } }),
  accessViaToken: (token) => apiRequest('/auth/access', { method: 'POST', body: { token } }),
  me: () => apiRequest('/auth/me'),

  createPatient: (payload) => apiRequest('/patients', { method: 'POST', body: payload }),
  linkPatient: (code) => apiRequest('/patients/link', { method: 'POST', body: { code } }),
  regeneratePatientLink: (id) => apiRequest(`/patients/${id}/regenerate-link`, { method: 'POST' }),
  reportIssue: (patientId, issueType, medicationName) =>
    apiRequest(`/patients/${patientId}/report-issue`, {
      method: 'POST',
      body: { issueType, medicationName },
    }),
  getPatients: () => apiRequest('/patients'),

  getMedications: (patientId) => apiRequest(`/medications?patientId=${patientId}`),
  getTodayDoses: (patientId) => apiRequest(`/medications/${patientId}/today`),
  addMedication: (payload) => apiRequest('/medications', { method: 'POST', body: payload }),
  updateMedication: (id, payload) => apiRequest(`/medications/${id}`, { method: 'PUT', body: payload }),
  deleteMedication: (id) => apiRequest(`/medications/${id}`, { method: 'DELETE' }),
  takeDose: (id) => apiRequest(`/doses/${id}/take`, { method: 'POST' }),

  getAppointments: (patientId) => apiRequest(`/appointments?patientId=${patientId}`),
  addAppointment: (payload) => apiRequest('/appointments', { method: 'POST', body: payload }),
  updateAppointment: (id, payload) => apiRequest(`/appointments/${id}`, { method: 'PUT', body: payload }),
  deleteAppointment: (id) => apiRequest(`/appointments/${id}`, { method: 'DELETE' }),

  getVitals: (patientId, type) =>
    apiRequest(`/vitals?patientId=${patientId}${type ? `&type=${type}` : ''}`),
  addVital: (payload) => apiRequest('/vitals', { method: 'POST', body: payload }),
  deleteVital: (id) => apiRequest(`/vitals/${id}`, { method: 'DELETE' }),

  getNotifications: () => apiRequest('/notifications'),
  markNotificationRead: (id) => apiRequest(`/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: () => apiRequest('/notifications/read-all', { method: 'POST' }),
};
