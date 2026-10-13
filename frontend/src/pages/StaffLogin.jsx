import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/AuthLayout';
import './Auth.css';

const StaffLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { loginStaff } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await loginStaff(email, password);
      navigate('/staff/dashboard');
    } catch (loginError) {
      setError(loginError.response?.data?.message || 'Staff login failed.');
    }
  };

  return (
    <AuthLayout
      pageTitle="Staff Access"
      pageSubtitle="Handle daily cemetery operations."
      description="Sign in with an authorized staff account to manage memorial records, reservations, reports, and payment verification."
      promptTitle="Staff Access"
      promptDescription="Sign in with an authorized staff email and password."
    >
      <form onSubmit={handleSubmit} autoComplete="off">
        <div className="form-group">
          <label htmlFor="staff-login-email">Email</label>
          <input id="staff-login-email" type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </div>
        <div className="form-group">
          <label htmlFor="staff-login-password">Password</label>
          <input id="staff-login-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </div>
        <p className="auth-switch admin-forgot-link">
          <Link to="/staff/recovery">Forgot password?</Link>
        </p>
        {error && <p className="error-msg" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary auth-btn">Login</button>
      </form>
      <p className="auth-switch">
        <Link to="/login">Return to User Login</Link>
      </p>
    </AuthLayout>
  );
};

export default StaffLogin;
