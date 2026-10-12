import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/AuthLayout';
import './Auth.css';

const StaffRegister = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { registerStaff } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await registerStaff(name, email, password);
      navigate('/staff/login');
    } catch (err) {
      setError(
        err.response?.data?.message ||
        (err.code === 'ERR_NETWORK'
          ? 'Cannot reach the backend. Make sure both servers are running with npm run dev.'
          : 'Registration failed. Please try again.')
      );
    }
  };

  return (
    <AuthLayout
      pageTitle="Staff Account Registration"
      pageSubtitle="Handle daily cemetery operations."
      description="Register a staff account to manage memorial records, reservations, reports, and payment verification."
      promptTitle="Register Staff Account"
      promptDescription="Create a staff account to access the staff dashboard."
    >
      <form onSubmit={handleSubmit} autoComplete="off">
        <div className="form-group">
          <label htmlFor="staff-register-name">Name</label>
          <input id="staff-register-name" type="text" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
        </div>
        <div className="form-group">
          <label htmlFor="staff-register-email">Email</label>
          <input id="staff-register-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="form-group">
          <label htmlFor="staff-register-password">Password</label>
          <input id="staff-register-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </div>
        {error && <p className="error-msg" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary auth-btn">Register Staff Account</button>
      </form>

      <p className="auth-switch">
        Already have an account? <Link to="/staff/login">Staff Login</Link>
      </p>
    </AuthLayout>
  );
};

export default StaffRegister;