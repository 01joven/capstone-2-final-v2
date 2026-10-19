import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute, { AdminRoute, StaffRoute } from './components/ProtectedRoute';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import MapView from './pages/MapView';
import Search from './pages/Search';
import ReservationDetail from './pages/ReservationDetail';
import Payments from './pages/Payments';
import Saved from './pages/Saved';
import Profile from './pages/Profile';
import AdminLogin from './pages/AdminLogin';
import StaffLogin from './pages/StaffLogin';
import PasswordRecovery from './pages/PasswordRecovery';
import AdminPortal from './pages/AdminPortal';
import MemorialRecord from './pages/MemorialRecord';
import NotFound from './pages/NotFound';
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/staff/login" element={<StaffLogin />} />
        <Route path="/staff/register" element={<Navigate to="/staff/login" replace />} />
        <Route path="/admin/recovery" element={<PasswordRecovery audience="admin" />} />
        <Route path="/staff/recovery" element={<PasswordRecovery audience="staff" />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/map" element={<MapView />} />
        <Route path="/search" element={<Search />} />
        <Route path="/records/:id" element={<MemorialRecord />} />
        <Route path="/reservations" element={<ProtectedRoute><ReservationDetail /></ProtectedRoute>} />
        <Route path="/reservations/plot/:section/:lot" element={<ProtectedRoute><ReservationDetail /></ProtectedRoute>} />
        <Route path="/reservations/:id" element={<ProtectedRoute><ReservationDetail /></ProtectedRoute>} />
        <Route path="/payments" element={<ProtectedRoute><Payments /></ProtectedRoute>} />
        <Route path="/saved" element={<ProtectedRoute><Saved /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="/admin/dashboard" element={<AdminRoute><AdminPortal /></AdminRoute>} />
        <Route path="/admin/records" element={<AdminRoute><AdminPortal /></AdminRoute>} />
        <Route path="/admin/map" element={<AdminRoute><MapView /></AdminRoute>} />
        <Route path="/admin/reservations" element={<AdminRoute><AdminPortal /></AdminRoute>} />
        <Route path="/admin/pendings" element={<AdminRoute><AdminPortal /></AdminRoute>} />
        <Route path="/admin/reports" element={<AdminRoute><AdminPortal /></AdminRoute>} />
        <Route path="/admin/users" element={<AdminRoute><AdminPortal /></AdminRoute>} />
        <Route path="/admin/security" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="/staff" element={<Navigate to="/staff/dashboard" replace />} />
        <Route path="/staff/dashboard" element={<StaffRoute><AdminPortal scope="staff" /></StaffRoute>} />
        <Route path="/staff/records" element={<StaffRoute><AdminPortal scope="staff" /></StaffRoute>} />
        <Route path="/staff/map" element={<StaffRoute><MapView /></StaffRoute>} />
        <Route path="/staff/reservations" element={<StaffRoute><AdminPortal scope="staff" /></StaffRoute>} />
        <Route path="/staff/pendings" element={<StaffRoute><AdminPortal scope="staff" /></StaffRoute>} />
        <Route path="/staff/reports" element={<StaffRoute><AdminPortal scope="staff" /></StaffRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
