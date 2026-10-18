import { createContext, useCallback, useContext, useState, useEffect } from 'react';
import { authAPI, userAPI } from '../services/api';

const AuthContext = createContext();

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

const parseStoredUser = () => {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.id !== 'number' || !['staff', 'admin'].includes(parsed.role)) {
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUser(parseStoredUser());
    setLoading(false);
  }, []);

  useEffect(() => {
    const handlePageShow = (event) => {
      if (!event.persisted) return;          // only bfcache restores
      const stored = parseStoredUser();      // re-sync React state from localStorage
      setUser(stored);
      if (!stored) {
        const path = window.location.pathname;
        const target = path.startsWith('/admin') ? '/admin/login'
          : path.startsWith('/staff') ? '/staff/login' : '/';
        window.location.replace(target);
        return;
      }
      // Validate the restored session server-side; a 401 is handled by the API interceptor.
      userAPI.getProfile().catch(() => {});
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  const login = async (email, password) => {
    const { data } = await authAPI.login({ email, password });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const loginAdmin = async (email, password) => {
    const { data } = await authAPI.adminLogin({ email, password });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const loginStaff = async (email, password) => {
    const { data } = await authAPI.staffLogin({ email, password });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    const token = localStorage.getItem('token');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    // Revoke the session on the server; ignore failures (the token is already gone locally).
    if (token) {
      authAPI.logout(token).catch(() => {});
    }
  };

  const setSessionToken = useCallback((token) => {
    localStorage.setItem('token', token);
  }, []);

  const updateUser = useCallback((updatedUser) => {
    localStorage.setItem('user', JSON.stringify(updatedUser));
    setUser(updatedUser);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, loginAdmin, loginStaff, logout, updateUser, setSessionToken, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
