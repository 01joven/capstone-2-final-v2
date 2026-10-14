import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import MemorialLogo from './MemorialLogo';
import './Sidebar.css';

const Sidebar = ({ isOpen = false, onClose = () => {} }) => {
  const { user, logout } = useAuth();

  const adminLinks = [
    { to: '/admin/dashboard', label: 'Dashboard', icon: '🏠' },
    { to: '/admin/records', label: 'Memorial Records', icon: '📋' },
    { to: '/admin/map', label: 'Cemetery Map / Plots', icon: '🗺️' },
    { to: '/admin/reservations', label: 'Reservations', icon: '📅' },
    { to: '/admin/submissions', label: 'Submissions', icon: '📝' },
    { to: '/admin/reports', label: 'Reports', icon: '📈' },
    { to: '/admin/users', label: 'User Management', icon: '👥' },
    { to: '/payments', label: 'Cash Records', icon: '💵' },
  ];

  const staffLinks = [
    { to: '/staff/dashboard', label: 'Dashboard', icon: '🏠' },
    { to: '/staff/records', label: 'Memorial Records', icon: '📋' },
    { to: '/staff/map', label: 'Cemetery Map / Plots', icon: '🗺️' },
    { to: '/staff/reservations', label: 'Reservations', icon: '📅' },
    { to: '/staff/submissions', label: 'Submissions', icon: '📝' },
    { to: '/staff/reports', label: 'Reports', icon: '📈' },
    { to: '/payments', label: 'Cash Records', icon: '💵' },
  ];

  const publicLinks = [
    { to: '/map', label: 'Cemetery Map', icon: '🗺️' },
    { to: '/admin/login', label: 'Admin Portal', icon: '🔐' },
    { to: '/staff/login', label: 'Staff Portal', icon: '👤' },
  ];

  const links = user?.is_admin
    ? adminLinks
    : user?.is_staff
      ? staffLinks
      : publicLinks;

  const handleLinkClick = () => {
    if (onClose) onClose();
  };

  return (
    <aside className={`sidebar ${isOpen ? 'mobile-open' : ''}`} aria-label="Main Navigation">
      <div className="sidebar-brand">
        <NavLink
          to={user?.is_admin ? '/admin/dashboard' : user?.is_staff ? '/staff/dashboard' : '/'}
          className="sidebar-brand-link"
          aria-label="Cogon Memorial Records System"
          onClick={handleLinkClick}
        >
          <MemorialLogo className="memorial-logo sidebar-logo" />
          <span>
            <strong>Cogon Memorial.</strong>
            <small>
              {user?.is_admin
                ? 'Admin Console'
                : user?.is_staff
                  ? 'Staff Console'
                  : 'Records System'}
            </small>
          </span>
        </NavLink>

        {/* Mobile close button inside drawer */}
        <button
          type="button"
          className="sidebar-mobile-close-btn"
          onClick={onClose}
          aria-label="Close navigation sidebar"
        >
          ✕
        </button>
      </div>

      <nav className="sidebar-nav">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            onClick={handleLinkClick}
          >
            <span className="sidebar-icon">{link.icon}</span>
            <span className="sidebar-link-text">{link.label}</span>
          </NavLink>
        ))}
      </nav>

      {user ? (
        <div className="sidebar-footer">
          <p className="sidebar-user">Signed in as: <strong>{user?.name}</strong></p>
          <button
            type="button"
            className="btn btn-outline sidebar-logout"
            onClick={() => {
              handleLinkClick();
              logout();
            }}
          >
            Sign Out
          </button>
        </div>
      ) : (
        <div className="sidebar-footer">
          <NavLink
            to="/admin/login"
            className="btn btn-primary sidebar-login-btn"
            onClick={handleLinkClick}
          >
            Sign In
          </NavLink>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
