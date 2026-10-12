import { Link } from 'react-router-dom';
import MemorialLogo from '../components/MemorialLogo';
import './LandingPage.css';

const LandingPage = () => {
  return (
    <div className="landing">
      <nav className="landing-nav">
        <Link to="/" className="landing-brand">
          <MemorialLogo className="memorial-logo" />
          <h1>Cogon Memorial Records System</h1>
        </Link>
        <div className="landing-nav-links">
          <Link to="/admin/login" className="btn btn-outline">Admin Login</Link>
          <Link to="/staff/login" className="btn btn-outline">Staff Login</Link>
          <Link to="/login" className="btn btn-outline">Login</Link>
          <Link to="/register" className="btn btn-primary">Register</Link>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-content">
          <h2>Preserving Memories... Mapping History</h2>
          <p>
            Discover, explore, and reserve memorial sites with our interactive map platform.
            Honor the past while navigating the present.
          </p>
          <Link to="/register" className="btn btn-accent hero-btn">Get Started</Link>
        </div>
      </section>
      <section className="features">
        <div className="feature-card card">
          <div className="feature-icon">🗺️</div>
          <h3>Interactive Map</h3>
          <p>Explore memorial locations on an interactive map with detailed site information.</p>
        </div>
        <div className="feature-card card">
          <div className="feature-icon">🔍</div>
          <h3>Smart Search</h3>
          <p>Find memorial sites by name, category, or location with powerful filters.</p>
        </div>
        <div className="feature-card card">
          <div className="feature-icon">📅</div>
          <h3>Easy Reservations</h3>
          <p>Book visits to memorial sites with a simple and secure reservation system.</p>
        </div>
      </section>
    </div>
  );
};

export default LandingPage;
