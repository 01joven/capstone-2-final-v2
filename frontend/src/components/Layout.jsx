import { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import Sidebar from './Sidebar';
import MemorialLogo from './MemorialLogo';
import { useAuth } from '../context/AuthContext';
import './Layout.css';

const Layout = ({ children }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { user } = useAuth();

  // Close mobile sidebar whenever location changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Prevent background body scroll when mobile sidebar drawer is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  return (
    <div className="app-layout">
      {/* Mobile Top Header Bar matching modern minimal aesthetic */}
      <header className="mobile-top-header">
        <Link
          to={user?.is_admin ? '/admin/dashboard' : user?.is_staff ? '/staff/dashboard' : '/'}
          className="mobile-header-brand"
        >
          <MemorialLogo className="mobile-header-logo" />
          <span className="mobile-header-title">Cogon Memorial.</span>
        </Link>

        <button
          type="button"
          className="mobile-header-hamburger"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          aria-label={mobileMenuOpen ? 'Close navigation sidebar' : 'Open navigation sidebar'}
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? (
            <span className="hamburger-close-x">✕</span>
          ) : (
            <span className="hamburger-lines" aria-hidden="true">
              <span className="line" />
              <span className="line" />
              <span className="line" />
            </span>
          )}
        </button>
      </header>

      {/* Backdrop overlay for mobile drawer */}
      {mobileMenuOpen && (
        <div
          className="mobile-sidebar-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar: Desktop fixed on left, Mobile smooth slide-out drawer */}
      <Sidebar
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      {/* Main Content */}
      <main className="app-main">{children}</main>
    </div>
  );
};

export default Layout;
