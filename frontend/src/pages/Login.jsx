import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/AuthLayout';
import './Auth.css';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login, logout } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const user = await login(email, password);
      if (user.is_admin) {
        logout();
        setError('Please use Administrator Login to access the admin dashboard.');
      } else if (user.is_staff) {
        logout();
        setError('Please use Staff Login to access the staff console.');
      } else if (!user.onboarding_completed) {
        navigate('/onboarding');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed.');
    }
  };

  return (
    <AuthLayout
      pageTitle="Cogon Memorial Records System"
      pageSubtitle="Login"
      description="Sign in to search memorial records, view maps, and manage your reservations and saved memorials."
      promptTitle="Login"
      promptDescription="Enter your account details to continue."
    >
        <form onSubmit={handleSubmit} autoComplete="off">
          <div className="form-group">
            <label htmlFor="login-email">Email</label>
            <input id="login-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="form-group">
            <label htmlFor="login-password">Password</label>
            <input id="login-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="error-msg">{error}</p>}
          <p className="auth-switch admin-forgot-link">
            <Link to="/forgot-password">Forgot password?</Link>
          </p>
          <button type="submit" className="btn btn-primary auth-btn">Login</button>
        </form>

        <p className="auth-switch">
          Don't have an account? <Link to="/register">Register</Link>
        </p>
        <Link to="/admin/login" className="btn btn-outline auth-admin-link">
          Administrator Access
        </Link>
        <Link to="/staff/login" className="btn btn-outline auth-admin-link">
          Staff Access
        </Link>
    </AuthLayout>
  );
};

export default Login;
