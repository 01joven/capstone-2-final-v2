import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import { authAPI } from '../services/api';
import './Auth.css';

const AdminRecovery = () => {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const requestCode = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { data } = await authAPI.requestAdminPasswordReset(email);
      setCodeSent(true);
      setMessage(data.message);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not request a recovery code.');
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { data } = await authAPI.resetAdminPassword({
        email,
        code,
        new_password: newPassword,
      });
      setMessage(data.message);
      setCodeSent(false);
      setCode('');
      setNewPassword('');
    } catch (resetError) {
      setError(resetError.response?.data?.message || 'Could not reset the administrator password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      pageTitle="Administrator Account Recovery"
      pageSubtitle="Verify your registered administrator email."
      description="Password recovery codes are sent only to the email already registered to the authorized administrator account."
      promptTitle="Secure Account Recovery"
      promptDescription="If you cannot access the registered email, contact the trusted system operator. Identity and authorization must be verified offline."
    >
      {!codeSent ? (
        <form onSubmit={requestCode}>
          <h2>Forgot Password</h2>
          <p className="auth-subtitle">Request a one-time code at your registered administrator email address.</p>
          <div className="form-group">
            <label htmlFor="recovery-email">Administrator email</label>
            <input id="recovery-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </div>
          {error && <p className="error-msg" role="alert">{error}</p>}
          {message && <p className="auth-feedback" role="status">{message}</p>}
          <button type="submit" className="btn btn-primary auth-btn" disabled={busy}>{busy ? 'Sending…' : 'Send Recovery Code'}</button>
        </form>
      ) : (
        <form onSubmit={resetPassword}>
          <h2>Verify and Change Password</h2>
          <p className="auth-subtitle">Enter the six-digit code sent to {email} and choose a new password.</p>
          <div className="form-group">
            <label htmlFor="recovery-code">Verification code</label>
            <input id="recovery-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={code} onChange={(event) => setCode(event.target.value)} required />
          </div>
          <div className="form-group">
            <label htmlFor="recovery-new-password">New password</label>
            <input id="recovery-new-password" type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
          </div>
          {error && <p className="error-msg" role="alert">{error}</p>}
          {message && <p className="auth-feedback" role="status">{message}</p>}
          <button type="submit" className="btn btn-primary auth-btn" disabled={busy}>{busy ? 'Updating…' : 'Verify Code and Change Password'}</button>
          <button type="button" className="btn btn-outline auth-btn" disabled={busy} onClick={() => { setCodeSent(false); setMessage(''); setError(''); }}>Request another code</button>
        </form>
      )}
      <p className="auth-switch"><Link to="/admin/login">Return to Administrator Login</Link></p>
    </AuthLayout>
  );
};

export default AdminRecovery;
