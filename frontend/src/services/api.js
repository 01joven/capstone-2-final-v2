import axios from 'axios';

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 60000,
});

API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

API.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const message = error.response?.data?.message || '';
    const isAuthExpired = status === 401 && /session|token|expired|invalid/i.test(message);
    const currentPath = window.location.pathname;
    const isLoginRoute = currentPath.startsWith('/admin/login') || currentPath.startsWith('/staff/login');
    if (isAuthExpired && !isLoginRoute) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      const loginPath = currentPath.startsWith('/admin') ? '/admin/login'
        : currentPath.startsWith('/staff') ? '/staff/login' : '/';
      window.location.replace(loginPath);
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (data) => API.post('/auth/admin/login', data),
  adminLogin: (data) => API.post('/auth/admin/login', data),
  staffLogin: (data) => API.post('/auth/staff/login', data),
  requestPasswordReset: (email) => API.post('/auth/password-reset/request', { email }),
  resetPassword: (data) => API.post('/auth/password-reset/confirm', data),
  // Pass the token explicitly: localStorage is cleared before this request is sent.
  logout: (token) => API.post('/auth/logout', null, { headers: { Authorization: `Bearer ${token}` } }),
};

export const userAPI = {
  getProfile: () => API.get('/users/profile'),
  updateProfile: (data) => API.put('/users/update', data),
  completeOnboarding: () => API.post('/users/onboarding-complete'),
};

export const memorialAPI = {
  getAll: (params) => API.get('/memorials', { params }),
  getById: (id) => API.get(`/memorials/${id}`),
};

export const burialAPI = {
  getAll: (params) => API.get('/burials', { params }),
};

export const publicAPI = {
  getBurials: (params) => API.get('/public/burials', { params }),
  getPlots: () => API.get('/public/plots'),
};

export const reservationAPI = {
  getUserReservations: () => API.get('/reservations/user-reservations'),
  getPlotReservations: () => API.get('/reservations/plots'),
  create: (data) => API.post('/reservations/create', data),
  cancel: (id) => API.post(`/reservations/${id}/cancel`),
  remove: (id) => API.delete(`/reservations/${id}`),
  reviewPlot: (id, action, note) => API.post(`/reservations/plots/${id}/review`, { action, note }),
};

export const favoriteAPI = {
  getAll: () => API.get('/favorites'),
  add: (memorial_id) => API.post('/favorites/add', { memorial_id }),
  remove: (id) => API.delete(`/favorites/remove/${id}`),
};

export const paymentAPI = {
  getAll: () => API.get('/payments'),
  recordCash: (data) => API.post('/payments/record-cash', data),
  getReceipt: (payment_id) => API.get(`/payments/${payment_id}/receipt`),
};

export const adminAPI = {
  getDashboard: () => API.get('/admin/dashboard'),
  getRecords: () => API.get('/admin/records'),
  createRecord: (data) => API.post('/admin/records', data),
  updateRecord: (id, data) => API.put(`/admin/records/${id}`, data),
  deleteRecord: (id) => API.delete(`/admin/records/${id}`),
  getSites: () => API.get('/admin/sites'),
  createSite: (data) => API.post('/admin/sites', data),
  updateSite: (id, data) => API.put(`/admin/sites/${id}`, data),
  getReservations: (params) => API.get('/admin/reservations', { params }),
  getReports: () => API.get('/admin/reports'),
  getCollections: (params) => API.get('/admin/collections', { params }),
  getSettlements: () => API.get('/admin/settlements'),
  createSettlement: (data) => API.post('/admin/settlements', data),
  voidSettlement: (id) => API.delete(`/admin/settlements/${id}`),
  searchReceipts: (q) => API.get('/admin/receipts/search', { params: { q } }),
  getUsers: () => API.get('/admin/users'),
  createUser: (data) => API.post('/admin/users', data),
  updateUserRole: (id, role) => API.put(`/admin/users/${id}/role`, { role }),
  setUserActive: (id, active) => API.put(`/admin/users/${id}/status`, { active }),
  deleteUser: (id) => API.delete(`/admin/users/${id}`),
};

export const staffAPI = {
  getDashboard: () => API.get('/staff/dashboard'),
  getRecords: () => API.get('/staff/records'),
  createRecord: (data) => API.post('/staff/records', data),
  updateRecord: (id, data) => API.put(`/staff/records/${id}`, data),
  deleteRecord: (id) => API.delete(`/staff/records/${id}`),
  getSites: () => API.get('/staff/sites'),
  createSite: (data) => API.post('/staff/sites', data),
  updateSite: (id, data) => API.put(`/staff/sites/${id}`, data),
  getReservations: (params) => API.get('/staff/reservations', { params }),
  getReports: () => API.get('/staff/reports'),
  getCollections: (params) => API.get('/staff/collections', { params }),
};

export default API;
