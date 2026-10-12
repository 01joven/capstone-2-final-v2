import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { userAPI } from '../services/api';
import usePolling from '../hooks/usePolling';
import './Dashboard.css';

const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({ reservations: 0, saved: 0 });
  const [error, setError] = useState('');

  const loadStats = async () => {
    try {
      const { data } = await userAPI.getProfile();
      setStats(data.stats);
      setError('');
    } catch (loadError) {
      setError(loadError.response?.data?.message || 'Could not refresh your dashboard.');
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  usePolling(loadStats);

  return (
    <Layout>
      <div className="page-container">
        <h1 className="page-title">Welcome, {user?.name}!</h1>
        {error && <p className="error-msg" role="alert">{error}</p>}

        <div className="dashboard-stats">
          <div className="stat-card card">
            <span className="stat-icon">📅</span>
            <div>
              <h3>{stats.reservations}</h3>
              <p>Reservations</p>
            </div>
          </div>
          <div className="stat-card card">
            <span className="stat-icon">❤️</span>
            <div>
              <h3>{stats.saved}</h3>
              <p>Saved Memorials</p>
            </div>
          </div>
        </div>

        <h2 className="section-title">Quick Actions</h2>
        <div className="quick-actions">
          <Link to="/search" className="action-card card">
            <span>🔍</span>
            <h3>Search Memorials</h3>
            <p>Find memorial sites near you</p>
          </Link>
          <Link to="/map" className="action-card card">
            <span>🗺️</span>
            <h3>View Map</h3>
            <p>Explore on interactive map</p>
          </Link>
          <Link to="/reservations" className="action-card card">
            <span>📅</span>
            <h3>New Reservation</h3>
            <p>Book a memorial visit</p>
          </Link>
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;
