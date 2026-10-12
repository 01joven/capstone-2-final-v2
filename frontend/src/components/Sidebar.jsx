import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import MemorialLogo from './MemorialLogo';
import './Sidebar.css';

const Sidebar = () => {
  const { user, logout } = useAuth();

  const links = user?.is_admin
    ? [
      { to: '/admin/dashboard', label: 'Dashboard', icon: '🏠' },
      { to: '/admin/records', label: 'Memorial Records', icon: '📋' },
      { to: '/admin/map', label: 'Cemetery Map / Plots', icon: '🗺️' },
      { to: '/admin/reservations', label: 'Reservations', icon: '📅' },
      { to: '/admin/reports', label: 'Reports', icon: '📈' },
      { to: '/admin/users', label: 'User Management', icon: '👥' },
      { to: '/admin/security', label: 'Account Security', icon: '🔐' },
      { to: '/payments?tab=review', label: 'Verify Payments', icon: '✅' },
    ]
    : user?.is_staff
    ? [
      { to: '/staff/dashboard', label: 'Dashboard', icon: '🏠' },
      { to: '/staff/records', label: 'Memorial Records', icon: '📋' },
      { to: '/staff/map', label: 'Cemetery Map / Plots', icon: '🗺️' },
      { to: '/staff/reservations', label: 'Reservations', icon: '📅' },
      { to: '/staff/reports', label: 'Reports', icon: '📈' },
      { to: '/payments?tab=review', label: 'Verify Payments', icon: '✅' },
    ]
    : [
      { to: '/dashboard', label: 'Home', icon: '🏠' },
      { to: '/search', label: 'Search', icon: '🔍' },
      { to: '/map', label: 'Map', icon: '🗺️' },
      { to: '/reservations', label: 'Reservations', icon: '📅' },
      { to: '/payments', label: 'Payments', icon: '💳' },
      { to: '/saved', label: 'Saved Memorials', icon: '❤️' },
      { to: '/profile', label: 'Profile', icon: '👤' },
    ];

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <NavLink to={user?.is_admin ? '/admin/dashboard' : user?.is_staff ? '/staff/dashboard' : '/dashboard'} className="sidebar-brand-link" aria-label="Cogon Memorial Records System dashboard">
          <MemorialLogo className="memorial-logo sidebar-logo" />
          <span>
            <strong>Cogon Memorial</strong>
            <small>{user?.is_admin ? 'Admin Console' : user?.is_staff ? 'Staff Console' : 'Records System'}</small>
          </span>
        </NavLink>
      </div>

      <nav className="sidebar-nav">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          >
            <span className="sidebar-icon">{link.icon}</span>
            {link.label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <p className="sidebar-user">Hello, {user?.name}</p>
        <button className="btn btn-outline sidebar-logout" onClick={logout}>
          Logout
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
