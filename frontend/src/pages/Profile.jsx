import { useCallback, useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { userAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import usePolling from '../hooks/usePolling';
import './Profile.css';

const Profile = () => {
  const { user, updateUser, setSessionToken } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [stats, setStats] = useState({ reservations: 0, saved: 0 });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isDirty, setIsDirty] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      const { data } = await userAPI.getProfile();
      if (!isDirty) {
        setName(data.name);
        setEmail(data.email);
        if (user?.name !== data.name || user?.email !== data.email) {
          updateUser({ ...user, name: data.name, email: data.email });
        }
      }
      setStats(data.stats);
      setError('');
    } catch (loadError) {
      setError(loadError.response?.data?.message || 'Could not refresh your profile.');
    }
  }, [isDirty, updateUser, user]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  usePolling(loadProfile);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const updateData = { name, email };
    if (password) updateData.password = password;
    const sensitive = Boolean(password) || email !== user?.email;
    if (sensitive) updateData.current_password = currentPassword;

    setError('');
    try {
      const { data } = await userAPI.updateProfile(updateData);
      if (data.token) setSessionToken(data.token);
      updateUser({ ...user, name: data.name, email: data.email });
      setName(data.name);
      setEmail(data.email);
      setPassword('');
      setCurrentPassword('');
      setIsDirty(false);
      setMessage('Profile updated successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Could not save your profile.');
    }
  };

  return (
    <Layout>
      <div className="page-container">
        <h1 className="page-title">Profile</h1>

        <div className="profile-layout">
          <form className="profile-form card" onSubmit={handleSubmit}>
            <h3>Account Settings</h3>
            <div className="form-group">
              <label>Name</label>
              <input type="text" value={name} onChange={(e) => { setName(e.target.value); setIsDirty(true); }} required />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setIsDirty(true); }} required />
            </div>
            <div className="form-group">
              <label>Change Password</label>
              <input type="password" autoComplete="new-password" value={password} onChange={(e) => { setPassword(e.target.value); setIsDirty(true); }} placeholder="Leave blank to keep current" />
            </div>
            <div className="form-group">
              <label>Current Password</label>
              <input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => { setCurrentPassword(e.target.value); setIsDirty(true); }} placeholder="Required to change your email or password" />
            </div>
            {error && <p className="error-msg" role="alert">{error}</p>}
            {message && <p style={{ color: 'var(--success)', marginBottom: 12 }}>{message}</p>}
            <button type="submit" className="btn btn-primary">Save Changes</button>
          </form>

          <div className="profile-stats card">
            <h3>Activity Summary</h3>
            <div className="activity-badges">
              <div className="activity-badge">
                <span className="badge-icon">📅</span>
                <div>
                  <h4>{stats.reservations}</h4>
                  <p>Total Reservations</p>
                </div>
              </div>
              <div className="activity-badge">
                <span className="badge-icon">❤️</span>
                <div>
                  <h4>{stats.saved}</h4>
                  <p>Saved Memorials</p>
                </div>
              </div>
              <div className="activity-badge">
                <span className="badge-icon">🏅</span>
                <div>
                  <h4>Explorer</h4>
                  <p>Member Badge</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Profile;
