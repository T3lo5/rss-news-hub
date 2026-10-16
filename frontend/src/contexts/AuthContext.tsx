import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { api, logoutSession, refreshSession, setAuthToken } from '../services/api';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user' | 'viewer';
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      const storedUser = localStorage.getItem(USER_KEY);

      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        setAuthToken(storedToken);
        setLoading(false);
        return;
      }

      // No local session (e.g. localStorage was cleared): the HttpOnly refresh
      // cookie may still be valid, so try to restore the session silently.
      const restoredToken = await refreshSession();
      if (restoredToken && !cancelled) {
        setToken(restoredToken);
        try {
          const me = await api.getMe();
          if (!cancelled) {
            setUser(me as User);
            localStorage.setItem(USER_KEY, JSON.stringify(me));
          }
        } catch {
          // Token refreshed but profile failed — fall through as logged out.
        }
      }
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    try {
      // Goes through the API client so an expired access token is refreshed
      // transparently before we decide the user is logged out.
      const data = await api.getMe();
      setUser(data as User);
      localStorage.setItem(USER_KEY, JSON.stringify(data));
    } catch {
      logout();
    }
  }, [token]);

  const login = async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');

    const accessToken = data.data.accessToken;
    setToken(accessToken);
    setAuthToken(accessToken);
    localStorage.setItem(TOKEN_KEY, accessToken);

    // Fetch user profile
    try {
      const meRes = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
      });
      if (!meRes.ok) throw new Error('Failed to fetch user profile');
      const meData = await meRes.json();
      setUser(meData.data);
      localStorage.setItem(USER_KEY, JSON.stringify(meData.data));
    } catch (err) {
      // If we can't fetch user, clear token and re-throw
      setToken(null);
      localStorage.removeItem(TOKEN_KEY);
      throw err;
    }
  };

  const register = async (email: string, password: string, name: string) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password, name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Register failed');
    await login(email, password);
  };

  const logout = () => {
    // Clear the server-side HttpOnly cookie, then local state.
    void logoutSession();
    setToken(null);
    setAuthToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}