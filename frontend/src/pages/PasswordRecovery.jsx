import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import { authAPI } from '../services/api';
import './Auth.css';

const recoveryDetails = {
  admin: {
    title: 'Administrator Password Recovery',
    login: '/admin/login',
    passwordMinLength: 12,
    description: 'Reset your administrator password using a code sent to your registered email.',
  },
  staff: {
    title: 'Staff Password Recovery',
    login: '/staff/login',
    passwordMinLength: 8,
    description: 'Reset your staff password using a code sent to your registered email.',
  },
};

const PasswordRecovery = ({ audience = 'staff' }) => {
  const details = recoveryDetails[audience];
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const requestCode = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { data } = await authAPI.requestPasswordReset(email);
      setCodeSent(true);
      setMessage(data.message);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not request a password reset code.');
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async (event) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { data } = await authAPI.resetPassword({
        email,
        code,
        new_password: newPassword,
      });
      setMessage(data.message);
      setCompleted(true);
      setCode('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (resetError) {
      setError(resetError.response?.data?.message || 'Could not reset your password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      pageTitle={details.title}
      pageSubtitle="Verify your registered email address."
      description={details.description}
      promptTitle="Secure Account Recovery"
      promptDescription={`A single-use code expires after 10 minutes. You can request at most 5 codes per hour, and each code allows 5 attempts. If you cannot access your registered email, contact the system operator.${audience === 'admin' ? ' Administrator passwords must contain at least 12 characters.' : ''}`}
    >
      {completed ? (
        <section>
          <h2>Password updated</h2>
          <p className="auth-feedback" role="status">{message}</p>
          <Link to={details.login} className="btn btn-primary auth-btn">Return to Login</Link>
        </section>
      ) : !codeSent ? (
        <form onSubmit={requestCode}>
          <h2>Forgot password?</h2>
          <p className="auth-subtitle">Enter your account email. If an account matches, we will send a reset code.</p>
          <div className="form-group">
            <label htmlFor={`${audience}-recovery-email`}>Email</label>
            <input
              id={`${audience}-recovery-email`}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          {error && <p className="error-msg" role="alert">{error}</p>}
          {message && <p className="auth-feedback" role="status">{message}</p>}
          <button type="submit" className="btn btn-primary auth-btn" disabled={busy}>
            {busy ? 'Sending code…' : 'Send reset code'}
          </button>
        </form>
      ) : (
        <form onSubmit={resetPassword}>
          <h2>Choose a new password</h2>
          <p className="auth-subtitle">Enter the six-digit code sent to {email}. Codes expire after 10 minutes.</p>
          <div className="form-group">
            <label htmlFor={`${audience}-recovery-code`}>Reset code</label>
            <input
              id={`${audience}-recovery-code`}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="[0-9]{6}"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor={`${audience}-new-password`}>New password</label>
            <input
              id={`${audience}-new-password`}
              type="password"
              autoComplete="new-password"
              minLength={details.passwordMinLength}
              maxLength={72}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
            <small>Use at least {details.passwordMinLength} characters.</small>
          </div>
          <div className="form-group">
            <label htmlFor={`${audience}-confirm-password`}>Confirm new password</label>
            <input
              id={`${audience}-confirm-password`}
              type="password"
              autoComplete="new-password"
              minLength={details.passwordMinLength}
              maxLength={72}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </div>
          {error && <p className="error-msg" role="alert">{error}</p>}
          {message && <p className="auth-feedback" role="status">{message}</p>}
          <button type="submit" className="btn btn-primary auth-btn" disabled={busy}>
            {busy ? 'Updating password…' : 'Reset password'}
          </button>
          <button
            type="button"
            className="btn btn-outline auth-btn"
            disabled={busy}
            onClick={() => {
              setCodeSent(false);
              setCode('');
              setConfirmPassword('');
              setMessage('');
              setError('');
            }}
          >
            Request another code
          </button>
        </form>
      )}
      {!completed && (
        <p className="auth-switch">
          <Link to={details.login}>Return to Login</Link>
        </p>
      )}
    </AuthLayout>
  );
};

export default PasswordRecovery;
