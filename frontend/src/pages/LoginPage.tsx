import { LogIn, Radio } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LanguageSelector } from '../components/LanguageSelector';
import { ThemeToggle } from '../components/ThemeToggle';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../i18n';

export function LoginPage() {
  const { login, register, user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // O registro pode estar desligado (ALLOW_REGISTRATION=false, e/ou bloqueio
  // no proxy). Nesse caso o link "Criar conta" some, em vez de abrir um
  // formulario que sempre termina em 403.
  const [registrationEnabled, setRegistrationEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!cancelled && body?.data) {
          setRegistrationEnabled(body.data.registrationEnabled !== false);
        }
      })
      .catch(() => {
        // Endpoint indisponivel: mantem o comportamento anterior (link visivel).
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await register(email, password, name);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('login.unknownError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-topbar">
        <LanguageSelector />
        <ThemeToggle />
      </div>

      <div className="login-card">
        <div className="login-brand">
          <span className="brand-mark" aria-hidden="true">
            <Radio size={22} strokeWidth={2.2} />
          </span>
          <h2>RSS News Hub</h2>
          <p className="subtitle">{t('header.subtitle')}</p>
        </div>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          {!isLogin && (
            <div className="form-group">
              <label htmlFor="name">{t('login.name')}</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required={!isLogin}
                autoComplete="name"
                disabled={loading}
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email">{t('login.email')}</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">{t('login.password')}</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              disabled={loading}
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            <LogIn size={16} />
            {loading ? t('login.submitting') : isLogin ? t('login.signIn') : t('login.signUp')}
          </button>
        </form>

        {registrationEnabled && (
          <p className="switch-mode">
            {isLogin ? t('login.noAccount') : t('login.hasAccount')}{' '}
            <button
              type="button"
              className="btn-link"
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
              }}
            >
              {isLogin ? t('login.signUp') : t('login.signIn')}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
