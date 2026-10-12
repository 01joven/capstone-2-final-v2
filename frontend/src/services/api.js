import axios from 'axios';

const API = axios.create({
  baseURL: '/api',
});

API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authAPI = {
  register: (data) => API.post('/auth/register', data),
  login: (data) => API.post('/auth/login', data),
  adminLogin: (data) => API.post('/auth/admin/login', data),
  staffLogin: (data) => API.post('/auth/staff/login', data),
};

export const userAPI = {
  getProfile: () => API.get('/users/profile'),
  updateProfile: (data) => API.put('/users/update', data),
  completeOnboarding: () => API.post('/users/onboarding-complete'),
  requestAdminEmailChange: (data) => API.post('/users/admin/email-change/request', data),
  confirmAdminEmailChange: (data) => API.post('/users/admin/email-change/confirm', data),
};

export const memorialAPI = {
  getAll: (params) => API.get('/memorials', { params }),
  getById: (id) => API.get(`/memorials/${id}`),
};

export const burialAPI = {
  getAll: (params) => API.get('/burials', { params }),
};

export const reservationAPI = {
  getUserReservations: () => API.get('/reservations/user-reservations'),
  create: (data) => API.post('/reservations/create', data),
};

export const favoriteAPI = {
  getAll: () => API.get('/favorites'),
  add: (memorial_id) => API.post('/favorites/add', { memorial_id }),
  remove: (id) => API.delete(`/favorites/remove/${id}`),
};

export const paymentAPI = {
  getAll: () => API.get('/payments'),
  create: (reservation_id, payment_reference) => API.post('/payments/create', {
    reservation_id,
    payment_reference,
  }),
  getPendingVerifications: () => API.get('/payments/admin/pending'),
  verify: (payment_id, action) => API.post(`/payments/admin/${payment_id}/verify`, { action }),
};

export const adminAPI = {
  getDashboard: () => API.get('/admin/dashboard'),
  getRecords: () => API.get('/admin/records'),
  createRecord: (data) => API.post('/admin/records', data),
  updateRecord: (id, data) => API.put(`/admin/records/${id}`, data),
  getReservations: () => API.get('/admin/reservations'),
  getReports: () => API.get('/admin/reports'),
  getUsers: () => API.get('/admin/users'),
  createUser: (data) => API.post('/admin/users', data),
  purgeDemo: (confirm) => API.post('/admin/maintenance/purge-demo', { confirm }),
};

export const staffAPI = {
  getDashboard: () => API.get('/staff/dashboard'),
  getRecords: () => API.get('/staff/records'),
  createRecord: (data) => API.post('/staff/records', data),
  updateRecord: (id, data) => API.put(`/staff/records/${id}`, data),
  getReservations: () => API.get('/staff/reservations'),
  getReports: () => API.get('/staff/reports'),
  staffRegister: (data) => API.post('/auth/register', data),
};

export default API;
