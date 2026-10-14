import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/AuthLayout';
import PasswordInput from '../components/PasswordInput';
import './Auth.css';

const AdminLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { loginAdmin } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await loginAdmin(email, password);
      navigate('/admin/dashboard');
    } catch (loginError) {
      if (!loginError.response) {
        if (loginError.code === 'ECONNABORTED') {
          setError('Server connection timed out. The backend server may be waking up, please try again.');
        } else {
          setError('Cannot connect to the backend server. Please verify your backend deployment or API URL.');
        }
      } else {
        setError(loginError.response.data?.message || 'Admin login failed. Please check your credentials.');
      }
    }
  };

  return (
    <AuthLayout
      pageTitle="Administrator Access"
      pageSubtitle="Manage records responsibly."
      description="Sign in with an authorized administrator account to review records, reservations, reports, and user accounts."
      promptTitle="Administrator Access"
      promptDescription="Sign in with an authorized administrator email and password."
    >
      <form onSubmit={handleSubmit} autoComplete="off">
        <div className="form-group">
          <label htmlFor="admin-login-email">Email</label>
          <input id="admin-login-email" type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </div>
        <PasswordInput
          id="admin-login-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <p className="auth-switch admin-forgot-link">
          <Link to="/admin/recovery">Forgot password?</Link>
        </p>
        {error && <p className="error-msg" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary auth-btn">Login</button>
      </form>
      <p className="auth-switch">
        <Link to="/">Return to Home</Link>
      </p>
    </AuthLayout>
  );
};

export default AdminLogin;
