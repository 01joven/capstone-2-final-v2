import { useState } from 'react';
import { Link } from 'react-router-dom';
import MemorialLogo from '../components/MemorialLogo';
import './LandingPage.css';

const LandingPage = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="landing">
      {/* Top Navbar matching the reference image */}
      <header className="landing-header">
        <Link to="/" className="landing-brand">
          <MemorialLogo className="memorial-logo" />
          <span className="brand-name">Cogon Memorial.</span>
        </Link>

        {/* Desktop Links */}
        <div className="landing-desktop-links">
          <Link to="/map" className="btn btn-outline nav-btn">Cemetery Map</Link>
          <Link to="/admin/login" className="btn btn-outline nav-btn">Admin Portal</Link>
          <Link to="/staff/login" className="btn btn-primary nav-btn">Staff Portal</Link>
        </div>

        {/* Mobile Hamburger Toggle (☰) matching reference image */}
        <button
          type="button"
          className="landing-hamburger-btn"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? (
            <span className="hamburger-close">✕</span>
          ) : (
            <span className="hamburger-bars">
              <span />
              <span />
              <span />
            </span>
          )}
        </button>
      </header>

      {/* Mobile Dropdown / Slide-out Menu */}
      {mobileMenuOpen && (
        <>
          <div
            className="landing-mobile-backdrop"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <nav className="landing-mobile-drawer" aria-label="Mobile Navigation">
            <div className="landing-mobile-drawer-header">
              <span className="brand-name">Menu</span>
              <button
                type="button"
                className="mobile-close-btn"
                onClick={() => setMobileMenuOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="landing-mobile-drawer-links">
              <Link
                to="/map"
                className="mobile-drawer-link"
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="drawer-link-icon">🗺️</span>
                Cemetery Map
              </Link>
              <Link
                to="/admin/login"
                className="mobile-drawer-link"
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="drawer-link-icon">🔐</span>
                Admin Portal
              </Link>
              <Link
                to="/staff/login"
                className="mobile-drawer-link"
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="drawer-link-icon">👤</span>
                Staff Portal
              </Link>
            </div>
          </nav>
        </>
      )}

      {/* Hero Section styled exactly like the user's reference mockup */}
      <section className="hero">
        <div className="hero-content">
          {/* Status Badge with Glowing Green Dot (matching "Available for new opportunities") */}
          <div className="hero-status-badge">
            <span className="status-dot-green" />
            <span>Open for Walk-in Visits · In-Person Cash Records</span>
          </div>

          {/* Large Bold Heading (matching "Hi, I'm Micco James.") */}
          <h1 className="hero-title">
            Cogon Memorial.
          </h1>

          {/* Subheading (matching "Frontend Developer & Web Developer") */}
          <h2 className="hero-subtitle">
            Cemetery Records &amp; Interactive Map
          </h2>

          {/* Paragraph Description */}
          <p className="hero-description">
            Locate where deceased loved ones are laid to rest across Sections A, B, and C.
            Families and walk-in visitors can visit burial spots anytime, with official cash
            reservations handled in person at the cemetery administration office.
          </p>

          {/* Action Row matching reference: Dark Pill Button + Floating Circle Button */}
          <div className="hero-actions-row">
            <Link to="/map" className="hero-pill-btn">
              Explore Cemetery Map
            </Link>
            <Link
              to="/admin/login"
              className="hero-circle-btn"
              title="Admin & Staff Login"
              aria-label="Admin & Staff Login"
            >
              🔐
            </Link>
          </div>
        </div>
      </section>

      {/* Feature Cards Grid */}
      <section className="features">
        <div className="feature-card card">
          <div className="feature-icon">🗺️</div>
          <h3>Cemetery Plot Map</h3>
          <p>Easily view sections and plot numbers to locate deceased family members and visit their exact grave spot.</p>
        </div>
        <div className="feature-card card">
          <div className="feature-icon">🚶</div>
          <h3>Walk-in Visitors Welcome</h3>
          <p>Families can walk in freely to visit memorial spots. Look up deceased records by name, dates, or grave reference.</p>
        </div>
        <div className="feature-card card">
          <div className="feature-icon">💵</div>
          <h3>Cash &amp; Walk-in Records</h3>
          <p>Reserve burial plots for the deceased at the cemetery administration office with official cash receipts.</p>
        </div>
      </section>
    </div>
  );
};

export default LandingPage;
