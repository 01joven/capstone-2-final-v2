import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/AuthLayout';
import './Auth.css';

const Register = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const { register, requestUserVerificationCode } = useAuth();
  const navigate = useNavigate();

  const handleSendCode = async () => {
    setError('');
    setInfo('');
    setSendingCode(true);
    try {
      const response = await requestUserVerificationCode(name, email, password);
      setCodeSent(true);
      setVerificationCode('');
      setInfo(response.message);
    } catch (err) {
      setError(
        err.response?.data?.message ||
        (err.code === 'ERR_NETWORK'
          ? 'Cannot reach the backend. Make sure both servers are running with npm run dev.'
          : 'Could not send the verification code. Please try again.')
      );
    } finally {
      setSendingCode(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await register(name, email, password, verificationCode);
      navigate('/onboarding');
    } catch (err) {
      setError(
        err.response?.data?.message ||
        (err.code === 'ERR_NETWORK'
          ? 'Cannot reach the backend. Make sure both servers are running with npm run dev.'
          : 'Registration failed. Please try again.')
      );
      if ([410, 429].includes(err.response?.status)) {
        setCodeSent(false);
        setVerificationCode('');
      }
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
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="register-name">Name</label>
            <input id="register-name" type="text" value={name} onChange={(e) => { setName(e.target.value); setCodeSent(false); setVerificationCode(''); setInfo(''); }} required maxLength={100} disabled={sendingCode} />
          </div>
          <div className="form-group">
            <label htmlFor="register-email">Email</label>
            <div className="admin-email-code-row">
              <input id="register-email" type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setCodeSent(false); setVerificationCode(''); setInfo(''); }} required disabled={sendingCode} />
              <button type="button" className="btn btn-outline" onClick={handleSendCode} disabled={sendingCode || !name.trim() || !email || password.length < 8}>
                {sendingCode ? 'Sending...' : codeSent ? 'Resend Code' : 'Send Code'}
              </button>
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="register-password">Password</label>
            <input id="register-password" type="password" autoComplete="new-password" value={password} onChange={(e) => { setPassword(e.target.value); setCodeSent(false); setVerificationCode(''); setInfo(''); }} required minLength={8} disabled={sendingCode} />
          </div>
          {codeSent && (
            <div className="form-group">
              <label htmlFor="register-code">Email verification code</label>
              <input
                id="register-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="Enter the 6-digit code"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
              />
            </div>
          )}
          <p className="auth-subtitle">Verify your email with the code before your account is created. The code expires in 10 minutes.</p>
          {info && <p className="success-msg" role="status">{info}</p>}
          {error && <p className="error-msg" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary auth-btn" disabled={!codeSent || verificationCode.length !== 6}>Verify Code &amp; Register</button>
        </form>

        <p className="auth-switch">
          Already have an account? <Link to="/login">Login</Link>
        </p>
    </AuthLayout>
  );
};

export default Register;
