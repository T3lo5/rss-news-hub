import {
  BarChart3,
  ChevronDown,
  LogOut,
  Menu as MenuIcon,
  Plus,
  Radio,
  RefreshCw,
  Rss,
  Send,
  Settings,
  Sparkles,
  UserCog,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useClickOutside } from '../hooks/useClickOutside';
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

interface HeaderProps {
  onRefresh: () => void;
  onAddClick: () => void;
  onStatsClick: () => void;
  onFeedsClick: () => void;
  onSettingsClick: () => void;
  onDigestClick: () => void;
  onUsersClick: () => void;
  onTelegramQueueClick: () => void;
  onUserSettingsClick: () => void;
}

function formatCountdown(nextRun: number | null): string {
  if (!nextRun) return '--:--';
  const diff = nextRun - Date.now();
  if (diff <= 0) return 'now';
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
  onUserSettingsClick,
}: HeaderProps) {
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);
  const [openMenu, setOpenMenu] = useState<'more' | 'user' | null>(null);
  const { user, logout } = useAuth();
  const { t } = useI18n();

  const moreRef = useClickOutside<HTMLDivElement>(openMenu === 'more', () => setOpenMenu(null));
  const userRef = useClickOutside<HTMLDivElement>(openMenu === 'user', () => setOpenMenu(null));

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        setSchedulerStatus(await api.getSchedulerStatus());
      } catch {
        // ignore — status is best-effort
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const run = useCallback((action: () => void) => {
    setOpenMenu(null);
    action();
  }, []);

  const isAdmin = user?.role === 'admin';
  const canQueue = user?.role === 'admin' || user?.role === 'user';
  const initial = user?.name?.trim()?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U';

  return (
    <header className="header">
      <div className="header-left">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Radio size={20} strokeWidth={2.2} />
          </span>
          <span className="brand-text">
            <strong>RSS News Hub</strong>
            <span className="subtitle">{t('header.subtitle')}</span>
          </span>
        </div>
      </div>

      <div className="header-actions">
        <div className="scheduler-status" title={t('header.autoOn')}>
          <span className={`scheduler-badge ${schedulerStatus?.running ? 'running' : 'stopped'}`}>
            {schedulerStatus?.running ? t('header.autoOn') : t('header.autoOff')}
          </span>
          <span className="next-fetch">
            {t('header.nextFetch')}{' '}
            <strong>{formatCountdown(schedulerStatus?.nextRun ?? null)}</strong>
          </span>
        </div>

        <button className="btn btn-primary" onClick={onRefresh}>
          <RefreshCw size={16} />
          <span className="btn-label">{t('header.refresh')}</span>
        </button>
        <button className="btn btn-secondary" onClick={onAddClick}>
          <Plus size={16} />
          <span className="btn-label">{t('header.add')}</span>
        </button>

        <div className="menu" ref={moreRef}>
          <button
            className="btn-icon"
            aria-haspopup="menu"
            aria-expanded={openMenu === 'more'}
            aria-label={t('header.more')}
            title={t('header.more')}
            onClick={() => setOpenMenu((m) => (m === 'more' ? null : 'more'))}
          >
            <MenuIcon size={18} />
          </button>
          {openMenu === 'more' && (
            <div className="menu-panel" role="menu">
              <button className="menu-item" role="menuitem" onClick={() => run(onFeedsClick)}>
                <Rss size={16} />
                {t('header.feeds')}
              </button>
              <button className="menu-item" role="menuitem" onClick={() => run(onStatsClick)}>
                <BarChart3 size={16} />
                {t('header.stats')}
              </button>
              {isAdmin && (
                <button className="menu-item" role="menuitem" onClick={() => run(onDigestClick)}>
                  <Sparkles size={16} />
                  {t('header.digest')}
                </button>
              )}
              {isAdmin && (
                <button className="menu-item" role="menuitem" onClick={() => run(onSettingsClick)}>
                  <Settings size={16} />
                  {t('header.settings')}
                </button>
              )}
              {isAdmin && (
                <button className="menu-item" role="menuitem" onClick={() => run(onUsersClick)}>
                  <Users size={16} />
                  {t('header.users')}
                </button>
              )}
              {canQueue && (
                <button
                  className="menu-item"
                  role="menuitem"
                  onClick={() => run(onTelegramQueueClick)}
                >
                  <Send size={16} />
                  {t('header.queue')}
                </button>
              )}
            </div>
          )}
        </div>

        <LanguageSelector />
        <ThemeToggle />

        {user ? (
          <div className="menu" ref={userRef}>
            <button
              className="user-chip"
              aria-haspopup="menu"
              aria-expanded={openMenu === 'user'}
              onClick={() => setOpenMenu((m) => (m === 'user' ? null : 'user'))}
            >
              <span className="user-avatar" aria-hidden="true">
                {initial}
              </span>
              <span className="user-meta">
                <span className="user-name">{user.name}</span>
                <span className="user-role">{t(`role.${user.role}`)}</span>
              </span>
              <ChevronDown size={14} aria-hidden="true" />
            </button>
            {openMenu === 'user' && (
              <div className="menu-panel" role="menu">
                <div className="menu-label">{user.email}</div>
                <div className="menu-sep" />
                <button
                  className="menu-item"
                  role="menuitem"
                  onClick={() => run(onUserSettingsClick)}
                >
                  <UserCog size={16} />
                  {t('header.mySettings')}
                </button>
                <div className="menu-sep" />
                <button className="menu-item danger" role="menuitem" onClick={logout}>
                  <LogOut size={16} />
                  {t('header.logout')}
                </button>
              </div>
            )}
          </div>
        ) : (
          <button className="btn btn-primary" onClick={() => (window.location.href = '/login')}>
            {t('header.login')}
          </button>
        )}
      </div>
    </header>
  );
}
