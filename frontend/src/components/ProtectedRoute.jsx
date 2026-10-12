import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export const AdminRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>;
  }
  if (!user) {
    return <Navigate to="/admin/login" replace />;
  }
  if (!user.is_admin) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
};

export const StaffRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>;
  }
  if (!user) {
    return <Navigate to="/staff/login" replace />;
  }
  if (!user.is_staff && !user.is_admin) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
};

export default ProtectedRoute;
