import { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { FeedStat, HealthStatus, StatsResponse } from '../types';

function formatDate(timestamp: number | null): string {
  if (!timestamp) return 'Nunca';
  try {
    return new Date(timestamp).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Inválido';
  }
}

function formatInterval(ms: number): string {
  if (ms < 60000) return `${ms / 1000}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}min`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}min`;
}

function formatUptime(seconds?: number): string {
  if (!seconds && seconds !== 0) return '—';
  const total = Math.floor(seconds);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}min`;
  return `${mins}min`;
}

interface StatsModalProps {
  onClose: () => void;
}

export function StatsModal({ onClose }: StatsModalProps) {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const data = await api.getStats();
        setStats(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao carregar estatísticas');
      } finally {
        setLoading(false);
      }
    };

    const fetchHealth = async () => {
      try {
        setHealth(await api.getHealth());
      } catch {
        // Health is best-effort: ignore when the endpoint is unavailable.
      }
    };

    fetchStats();
    fetchHealth();
  }, []);

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal stats-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>📊 Estatísticas dos Feeds</h2>
            <button className="btn-close" onClick={onClose} aria-label="Fechar">
              ×
            </button>
          </div>
          <div className="modal-body">
            <div className="loading">Carregando estatísticas...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal stats-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>📊 Estatísticas dos Feeds</h2>
            <button className="btn-close" onClick={onClose} aria-label="Fechar">
              ×
            </button>
          </div>
          <div className="modal-body">
            <div className="error">Erro: {error}</div>
          </div>
        </div>
      </div>
    );
  }

  const feeds = stats?.feeds || [];
  const totals = stats?.totals;
  const scheduler = stats?.scheduler;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal stats-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📊 Estatísticas dos Feeds</h2>
          <button className="btn-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        <div className="modal-body">
          {/* System health */}
          {health && (
            <div className="stats-section">
              <h3>🩺 Sistema</h3>
              <div className="stats-grid">
                <div className="stat-card">
                  <span className="stat-label">Estado</span>
                  <span className={`stat-value ${health.ok ? 'success' : 'danger'}`}>
                    {health.ok ? '🟢 Saudável' : '🔴 Indisponível'}
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Versão</span>
                  <span className="stat-value">{health.version || '—'}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Uptime</span>
                  <span className="stat-value">{formatUptime(health.uptime)}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Banco de dados</span>
                  <span className={`stat-value ${health.db.ok ? 'success' : 'danger'}`}>
                    {health.db.ok ? '🟢 OK' : '🔴 Erro'}
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Provedores IA ativos</span>
                  <span className="stat-value">
                    {health.providers.configured.length
                      ? health.providers.configured.join(', ')
                      : 'nenhum'}
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Retenção</span>
                  <span className="stat-value">
                    {health.schedulers.retention?.retentionDays
                      ? `${health.schedulers.retention.retentionDays} dias`
                      : 'desligada'}
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Worker Telegram</span>
                  <span
                    className={`stat-value ${
                      health.schedulers.telegram?.running ? 'success' : 'danger'
                    }`}
                  >
                    {health.schedulers.telegram?.running ? '🟢 ON' : '🔴 OFF'}
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Digest</span>
                  <span className="stat-value">
                    {health.schedulers.digest?.enabled
                      ? `próx. ${formatDate(health.schedulers.digest.nextRun ?? null)}`
                      : 'desligado'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Scheduler Summary */}
          <div className="stats-section">
            <h3>⚙️ Agendador</h3>
            <div className="stats-grid">
              <div className="stat-card">
                <span className="stat-label">Status</span>
                <span className={`stat-value ${scheduler?.running ? 'success' : 'danger'}`}>
                  {scheduler?.running ? '🟢 Rodando' : '🔴 Parado'}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Intervalo</span>
                <span className="stat-value">{formatInterval(scheduler?.intervalMs || 0)}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Última execução</span>
                <span className="stat-value">{formatDate(scheduler?.lastRun || null)}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Próxima execução</span>
                <span className="stat-value">{formatDate(scheduler?.nextRun || null)}</span>
              </div>
            </div>
          </div>

          {/* Totals */}
          <div className="stats-section">
            <h3>📈 Totais</h3>
            <div className="stats-grid">
              <div className="stat-card">
                <span className="stat-label">Total de buscas</span>
                <span className="stat-value">{totals?.totalFetches || 0}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Total de notícias</span>
                <span className="stat-value">{totals?.totalItems || 0}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Total de erros</span>
                <span className="stat-value danger">{totals?.totalErrors || 0}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Última busca completa</span>
                <span className="stat-value">{formatDate(totals?.lastFullFetch || null)}</span>
              </div>
            </div>
          </div>

          {/* Feed Health Table */}
          <div className="stats-section">
            <h3>🏥 Saúde dos Feeds</h3>
            {feeds.length === 0 ? (
              <p className="empty">Nenhum dado de feed disponível. Execute uma busca primeiro.</p>
            ) : (
              <div className="table-container">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th>Fonte</th>
                      <th>Status</th>
                      <th>Última busca</th>
                      <th>Notícias coletadas</th>
                      <th>ETag Hits</th>
                      <th>Último erro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feeds.map((feed: FeedStat) => (
                      <tr key={feed.name}>
                        <td className="feed-name">{feed.name}</td>
                        <td>
                          <span className={`status-badge ${feed.lastStatus || 'unknown'}`}>
                            {feed.lastStatus === 'ok'
                              ? '✅ OK'
                              : feed.lastStatus === 'error'
                                ? '❌ Erro'
                                : '⏳ --'}
                          </span>
                        </td>
                        <td>{formatDate(feed.lastFetch)}</td>
                        <td>{feed.itemsFetched}</td>
                        <td>{feed.etagHits}</td>
                        <td className="error-cell">{feed.lastError || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
