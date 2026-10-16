import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { ThemeToggle } from './ThemeToggle';
import { useAuth } from '../contexts/AuthContext';

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
}: HeaderProps) {
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);
  const { user, logout } = useAuth();

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
        <span className="subtitle">Notícias coletadas manualmente + IA + Telegram</span>
      </div>
      <div className="header-actions">
        <div
          className="scheduler-status"
          style={{ display: 'flex', alignItems: 'center', gap: '12px', marginRight: '16px' }}
        >
          <span className={`scheduler-badge ${schedulerStatus?.running ? 'running' : 'stopped'}`}>
            {schedulerStatus?.running ? 'Auto: ON' : 'Auto: OFF'}
          </span>
          <span className="next-fetch">
            Próxima busca: <strong>{formatCountdown(schedulerStatus?.nextRun || null)}</strong>
          </span>
        </div>
        <ThemeToggle />
        <button className="btn btn-primary" onClick={onRefresh}>
          <span role="img" aria-label="refresh">
            🔄
          </span>{' '}
          Atualizar RSS
        </button>
        <button className="btn btn-secondary" onClick={onAddClick}>
          <span role="img" aria-label="add">
            ＋
          </span>{' '}
          Adicionar
        </button>
        <button className="btn btn-secondary" onClick={onFeedsClick}>
          <span role="img" aria-label="feeds">
            📋
          </span>{' '}
          Feeds
        </button>
        <button className="btn btn-secondary" onClick={onStatsClick}>
          <span role="img" aria-label="stats">
            📊
          </span>{' '}
          Estatísticas
        </button>
        {user?.role === 'admin' && (
          <button className="btn btn-secondary" onClick={onDigestClick}>
            <span role="img" aria-label="digest">
              🧠
            </span>{' '}
            Digest
          </button>
        )}
        {user?.role === 'admin' && (
          <button className="btn btn-secondary" onClick={onSettingsClick}>
            <span role="img" aria-label="settings">
              ⚙️
            </span>{' '}
            Configurações
          </button>
        )}
        {user ? (
          <div className="user-menu" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: '16px' }}>
            <span className="user-name" style={{ fontSize: '14px', color: '#666' }}>
              {user.name} ({user.role})
            </span>
            <button className="btn btn-secondary" onClick={logout} style={{ padding: '8px 12px' }}>
              Sair
            </button>
          </div>
        ) : (
          <button className="btn btn-primary" onClick={() => window.location.href = '/login'} style={{ marginLeft: '16px' }}>
            Entrar
          </button>
        )}
      </div>
    </header>
  );
}
