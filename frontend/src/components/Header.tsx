import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../i18n';
import { api } from '../services/api';
import { LanguageSelector } from './LanguageSelector';
import { ThemeToggle } from './ThemeToggle';

interface SchedulerStatus {
  running: boolean;
  intervalMs: number;
  lastRun: number | null;
  nextRun: number | null;
  lastResult: unknown;
}

interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user' | 'viewer';
}

interface HeaderProps {
  onRefresh: () => void;
  onAddClick: () => void;
  onStatsClick: () => void;
  onFeedsClick: () => void;
  onSettingsClick: () => void;
  onDigestClick: () => void;
  onUsersClick: () => void;
  onTelegramQueueClick: () => void;
}

function formatCountdown(nextRun: number | null): string {
  if (!nextRun) return '--:--';
  const diff = nextRun - Date.now();
  if (diff <= 0) return 'Agora';
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

export function Header({
  onRefresh,
  onAddClick,
  onStatsClick,
  onFeedsClick,
  onSettingsClick,
  onDigestClick,
  onUsersClick,
  onTelegramQueueClick,
}: HeaderProps) {
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);
  const { user, logout } = useAuth();
  const { t } = useI18n();

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    const fetchStatus = async () => {
      try {
        const res = await api.getSchedulerStatus();
        setSchedulerStatus(res);
      } catch {
        // ignore
      }
    };

    fetchStatus();
    interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="header">
      <div className="header-left">
        <h1>
          <span role="img" aria-label="antenna">
            📡
          </span>
          RSS News Hub
        </h1>
        <span className="subtitle">{t('header.subtitle')}</span>
      </div>
      <div className="header-actions">
        <div
          className="scheduler-status"
          style={{ display: 'flex', alignItems: 'center', gap: '12px', marginRight: '16px' }}
        >
          <span className={`scheduler-badge ${schedulerStatus?.running ? 'running' : 'stopped'}`}>
            {schedulerStatus?.running ? t('header.autoOn') : t('header.autoOff')}
          </span>
          <span className="next-fetch">
            {t('header.nextFetch')}{' '}
            <strong>{formatCountdown(schedulerStatus?.nextRun || null)}</strong>
          </span>
        </div>
        <LanguageSelector />
        <ThemeToggle />
        <button className="btn btn-primary" onClick={onRefresh}>
          <span role="img" aria-label="refresh">
            🔄
          </span>{' '}
          {t('header.refresh')}
        </button>
        <button className="btn btn-secondary" onClick={onAddClick}>
          <span role="img" aria-label="add">
            ＋
          </span>{' '}
          {t('header.add')}
        </button>
        <button className="btn btn-secondary" onClick={onFeedsClick}>
          <span role="img" aria-label="feeds">
            📋
          </span>{' '}
          {t('header.feeds')}
        </button>
        <button className="btn btn-secondary" onClick={onStatsClick}>
          <span role="img" aria-label="stats">
            📊
          </span>{' '}
          {t('header.stats')}
        </button>
        {user?.role === 'admin' && (
          <button className="btn btn-secondary" onClick={onDigestClick}>
            <span role="img" aria-label="digest">
              🧠
            </span>{' '}
            {t('header.digest')}
          </button>
        )}
        {user?.role === 'admin' && (
          <button className="btn btn-secondary" onClick={onSettingsClick}>
            <span role="img" aria-label="settings">
              ⚙️
            </span>{' '}
            {t('header.settings')}
          </button>
        )}
        {user?.role === 'admin' && (
          <button className="btn btn-secondary" onClick={onUsersClick}>
            <span role="img" aria-label="users">
              👥
            </span>{' '}
            {t('header.users')}
          </button>
        )}
        {(user?.role === 'admin' || user?.role === 'user') && (
          <button className="btn btn-secondary" onClick={onTelegramQueueClick}>
            <span role="img" aria-label="telegram queue">
              📨
            </span>{' '}
            {t('header.queue')}
          </button>
        )}
        {user ? (
          <div
            className="user-menu"
            style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: '16px' }}
          >
            <span className="user-name" style={{ fontSize: '14px', color: '#666' }}>
              {user.name} ({user.role})
            </span>
            <button className="btn btn-secondary" onClick={logout} style={{ padding: '8px 12px' }}>
              {t('header.logout')}
            </button>
          </div>
        ) : (
          <button
            className="btn btn-primary"
            onClick={() => (window.location.href = '/login')}
            style={{ marginLeft: '16px' }}
          >
            {t('header.login')}
          </button>
        )}
      </div>
    </header>
  );
}
