import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/AuthLayout';
import './Auth.css';

const Register = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await register(name, email, password);
      navigate('/onboarding');
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
      pageTitle="Create Your Memorial Account"
      pageSubtitle="Remembering Every Life, Preserving Every Memory."
      description="Register an account to access memorial records, search burial information, and explore the interactive memorial map of Cogon, Cordova, Cebu."
      promptTitle="Join the Memorial Records System"
      promptDescription="Create your account to securely access available memorial information."
    >
        <form onSubmit={handleSubmit} autoComplete="off">
          <div className="form-group">
            <label htmlFor="register-name">Name</label>
            <input id="register-name" type="text" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
          </div>
          <div className="form-group">
            <label htmlFor="register-email">Email</label>
            <input id="register-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="form-group">
            <label htmlFor="register-password">Password</label>
            <input id="register-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </div>
          {error && <p className="error-msg" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary auth-btn">Register</button>
        </form>

        <p className="auth-switch">
          Already have an account? <Link to="/login">Login</Link>
        </p>
    </AuthLayout>
  );
};

export default Register;