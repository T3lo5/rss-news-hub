import {
  BarChart3,
  ChevronDown,
  Download,
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
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useClickOutside } from '../hooks/useClickOutside';
import { usePwaInstall } from '../hooks/usePwaInstall';
import { useI18n } from '../i18n';
import { api } from '../services/api';
import { InstallHelpModal } from './InstallHelpModal';
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
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const { canPrompt, installed, isIos, promptInstall } = usePwaInstall();
  const { user, logout } = useAuth();
  const { t } = useI18n();

  const moreRef = useClickOutside<HTMLDivElement>(openMenu === 'more', () => setOpenMenu(null));
  const userRef = useClickOutside<HTMLDivElement>(openMenu === 'user', () => setOpenMenu(null));
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const userTriggerRef = useRef<HTMLButtonElement>(null);

  // Os painéis anunciam aria-haspopup="menu", então precisam do comportamento
  // esperado: Escape fecha e devolve o foco ao gatilho, setas/Home/End
  // navegam entre os itens (MU-010).
  const handleMenuKeys = useCallback(
    (
      event: React.KeyboardEvent<HTMLDivElement>,
      close: () => void,
      trigger: React.RefObject<HTMLButtonElement | null>
    ) => {
      const panel = event.currentTarget.querySelector<HTMLElement>('.menu-panel');

      if (event.key === 'Escape') {
        if (!panel) return;
        event.preventDefault();
        event.stopPropagation(); // não deixa o fechador global tratar de novo
        close();
        trigger.current?.focus();
        return;
      }

      if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>('[role="menuitem"]'));
      if (items.length === 0) return;
      const index = items.indexOf(document.activeElement as HTMLElement);

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        items[index + 1 >= items.length ? 0 : index + 1].focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        items[index <= 0 ? items.length - 1 : index - 1].focus();
      } else if (event.key === 'Home') {
        event.preventDefault();
        items[0].focus();
      } else if (event.key === 'End') {
        event.preventDefault();
        items[items.length - 1].focus();
      }
    },
    []
  );

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

  const run = useCallback(
    (action: () => void) => {
      // Fecha o menu e devolve o foco ao botão que o abriu: sem isso o foco
      // fica perdido no <body> quando o painel desmonta com o item ativado.
      const trigger = openMenu === 'more' ? moreTriggerRef.current : userTriggerRef.current;
      setOpenMenu(null);
      action();
      trigger?.focus();
    },
    [openMenu]
  );

  const install = async () => {
    if (canPrompt) {
      try {
        await promptInstall();
        return;
      } catch {
        // Prompt unavailable (e.g. already consumed): fall back to the steps.
      }
    }
    // iOS: no install prompt, so show the Share -> Add to Home Screen steps.
    setShowInstallHelp(true);
  };

  const isAdmin = user?.role === 'admin';
  const canQueue = user?.role === 'admin' || user?.role === 'user';
  const initial = user?.name?.trim()?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U';

  return (
    <>
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

          <button
            className="btn btn-primary"
            onClick={onRefresh}
            aria-label={t('header.refresh')}
            title={t('header.refresh')}
          >
            <RefreshCw size={16} />
            <span className="btn-label">{t('header.refresh')}</span>
          </button>
          <button
            className="btn btn-secondary"
            onClick={onAddClick}
            aria-label={t('header.add')}
            title={t('header.add')}
          >
            <Plus size={16} />
            <span className="btn-label">{t('header.add')}</span>
          </button>

          <div
            className="menu"
            ref={(node) => {
              moreRef.current = node;
            }}
            onKeyDown={(event) => handleMenuKeys(event, () => setOpenMenu(null), moreTriggerRef)}
          >
            <button
              ref={moreTriggerRef}
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
                  <button
                    className="menu-item"
                    role="menuitem"
                    onClick={() => run(onSettingsClick)}
                  >
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
            <div
              className="menu"
              ref={(node) => {
                userRef.current = node;
              }}
              onKeyDown={(event) => handleMenuKeys(event, () => setOpenMenu(null), userTriggerRef)}
            >
              <button
                ref={userTriggerRef}
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
                  {!installed && (canPrompt || isIos) && (
                    <>
                      <button className="menu-item" role="menuitem" onClick={() => run(install)}>
                        <Download size={16} />
                        {t('pwa.install')}
                      </button>
                      <div className="menu-sep" />
                    </>
                  )}
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
      {showInstallHelp && <InstallHelpModal onClose={() => setShowInstallHelp(false)} />}
    </>
  );
}
