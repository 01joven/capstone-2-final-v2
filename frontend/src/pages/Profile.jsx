import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { userAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import './Profile.css';

const Profile = () => {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [stats, setStats] = useState({ reservations: 0, saved: 0 });
  const [message, setMessage] = useState('');

  useEffect(() => {
    userAPI.getProfile().then(({ data }) => {
      setName(data.name);
      setEmail(data.email);
      setStats(data.stats);
    });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const updateData = { name, email };
    if (password) updateData.password = password;

    const { data } = await userAPI.updateProfile(updateData);
    updateUser({ ...user, name: data.name, email: data.email });
    setPassword('');
    setMessage('Profile updated successfully!');
    setTimeout(() => setMessage(''), 3000);
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
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Change Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Leave blank to keep current" />
            </div>
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
