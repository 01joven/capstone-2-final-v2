import { useState } from 'react';
import Layout from '../components/Layout';
import { userAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import './AdminSecurity.css';

const AdminSecurity = () => {
  const { user, updateUser } = useAuth();
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [currentCode, setCurrentCode] = useState('');
  const [newCode, setNewCode] = useState('');
  const [codesSent, setCodesSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const requestCodes = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { data } = await userAPI.requestAdminEmailChange({
        new_email: newEmail,
        current_password: currentPassword,
      });
      setCodesSent(true);
      setMessage(data.message);
      setCurrentPassword('');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not request email verification codes.');
    } finally {
      setBusy(false);
    }
  };

  const confirmChange = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { data } = await userAPI.confirmAdminEmailChange({
        current_email_code: currentCode,
        new_email_code: newCode,
      });
      updateUser({ ...user, email: data.email });
      setNewEmail('');
      setCurrentCode('');
      setNewCode('');
      setCodesSent(false);
      setMessage(data.message);
    } catch (confirmError) {
      setError(confirmError.response?.data?.message || 'Could not verify both email addresses.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout>
      <div className="page-container admin-security">
        <h1 className="page-title">Account Security</h1>
        <p className="admin-security-intro">Administrator email changes require your current password and separate verification codes sent to both email addresses.</p>
        <section className="card admin-security-card">
          <h2>Change Administrator Email</h2>
          <p>Current verified email: <strong>{user?.email}</strong></p>
          {!codesSent ? (
            <form onSubmit={requestCodes}>
              <div className="form-group">
                <label htmlFor="new-admin-email">New email address</label>
                <input id="new-admin-email" type="email" autoComplete="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} required />
              </div>
              <div className="form-group">
                <label htmlFor="admin-current-password">Current password</label>
                <input id="admin-current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
              </div>
              <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send Codes to Both Emails'}</button>
            </form>
          ) : (
            <form onSubmit={confirmChange}>
              <p>Enter each six-digit code sent to the current email and to <strong>{newEmail}</strong>. Both codes expire in 10 minutes.</p>
              <div className="form-group">
                <label htmlFor="current-email-code">Code sent to current email</label>
                <input id="current-email-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={currentCode} onChange={(event) => setCurrentCode(event.target.value)} required />
              </div>
              <div className="form-group">
                <label htmlFor="new-email-code">Code sent to new email</label>
                <input id="new-email-code" inputMode="numeric" maxLength={6} pattern="[0-9]{6}" value={newCode} onChange={(event) => setNewCode(event.target.value)} required />
              </div>
              <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Verifying…' : 'Verify and Change Email'}</button>
              <button className="btn btn-outline admin-security-secondary" type="button" disabled={busy} onClick={() => { setCodesSent(false); setMessage(''); setError(''); }}>Start over</button>
            </form>
          )}
          {error && <p className="error-msg" role="alert">{error}</p>}
          {message && <p className="auth-feedback" role="status">{message}</p>}
        </section>
        <p className="admin-security-note">
          Lost access to the current email? Self-service recovery is intentionally unavailable. Contact the trusted system operator for offline identity and authorization checks before the registered admin email can be changed.
        </p>
      </div>
    </Layout>
  );
};

export default AdminSecurity;
