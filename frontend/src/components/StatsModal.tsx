import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { api } from '../services/api';
import type { FeedStat, HealthStatus, StatsResponse } from '../types';

function formatDate(timestamp: number | null, never: string, locale: string): string {
  if (!timestamp) return never;
  try {
    return new Date(timestamp).toLocaleString(locale, {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return never;
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
  const { t, language } = useI18n();
  const locale = language === 'en' ? 'en-US' : 'pt-BR';
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
        setError(e instanceof Error ? e.message : t('stats.errLoad'));
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
  }, [t]);

  const header = (
    <div className="modal-header">
      <h2>{t('stats.title')}</h2>
      <button className="btn-close" onClick={onClose} aria-label={t('common.close')}>
        ×
      </button>
    </div>
  );

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal stats-modal" onClick={(e) => e.stopPropagation()}>
          {header}
          <div className="modal-body">
            <div className="loading">{t('stats.loading')}</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal stats-modal" onClick={(e) => e.stopPropagation()}>
          {header}
          <div className="modal-body">
            <div className="error">{error}</div>
          </div>
        </div>
      </div>
    );
  }

  const feeds = stats?.feeds || [];
  const totals = stats?.totals;
  const scheduler = stats?.scheduler;
  const never = t('stats.never');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal stats-modal" onClick={(e) => e.stopPropagation()}>
        {header}

        <div className="modal-body">
          {/* System health */}
          {health && (
            <div className="stats-section">
              <h3>{t('stats.system')}</h3>
              <div className="stats-grid">
                <div className="stat-card">
                  <span className="stat-label">{t('stats.state')}</span>
                  <span className={`stat-value ${health.ok ? 'success' : 'danger'}`}>
                    {health.ok ? t('stats.healthy') : t('stats.unavailable')}
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">{t('stats.version')}</span>
                  <span className="stat-value">{health.version || '—'}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">{t('stats.uptime')}</span>
                  <span className="stat-value">{formatUptime(health.uptime)}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">{t('stats.database')}</span>
                  <span className={`stat-value ${health.db.ok ? 'success' : 'danger'}`}>
                    {health.db.ok ? t('stats.dbOk') : t('stats.dbError')}
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">{t('stats.providers')}</span>
                  <span className="stat-value">
                    {health.providers.configured.length
                      ? health.providers.configured.join(', ')
                      : t('stats.none')}
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">{t('stats.retention')}</span>
                  <span className="stat-value">
                    {health.schedulers.retention?.retentionDays
                      ? t('stats.retentionDays', {
                          days: health.schedulers.retention.retentionDays,
                        })
                      : t('stats.retentionOff')}
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">{t('stats.telegramWorker')}</span>
                  <span
                    className={`stat-value ${
                      health.schedulers.telegram?.running ? 'success' : 'danger'
                    }`}
                  >
                    {health.schedulers.telegram?.running ? t('stats.running') : t('stats.stopped')}
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">{t('stats.digest')}</span>
                  <span className="stat-value">
                    {health.schedulers.digest?.enabled
                      ? t('stats.digestNext', {
                          when: formatDate(health.schedulers.digest.nextRun ?? null, never, locale),
                        })
                      : t('stats.digestOff')}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Scheduler Summary */}
          <div className="stats-section">
            <h3>{t('stats.scheduler')}</h3>
            <div className="stats-grid">
              <div className="stat-card">
                <span className="stat-label">{t('stats.status')}</span>
                <span className={`stat-value ${scheduler?.running ? 'success' : 'danger'}`}>
                  {scheduler?.running ? t('stats.running') : t('stats.stopped')}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-label">{t('stats.interval')}</span>
                <span className="stat-value">{formatInterval(scheduler?.intervalMs || 0)}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">{t('stats.lastRun')}</span>
                <span className="stat-value">
                  {formatDate(scheduler?.lastRun || null, never, locale)}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-label">{t('stats.nextRun')}</span>
                <span className="stat-value">
                  {formatDate(scheduler?.nextRun || null, never, locale)}
                </span>
              </div>
            </div>
          </div>

          {/* Totals */}
          <div className="stats-section">
            <h3>{t('stats.totals')}</h3>
            <div className="stats-grid">
              <div className="stat-card">
                <span className="stat-label">{t('stats.totalFetches')}</span>
                <span className="stat-value">{totals?.totalFetches || 0}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">{t('stats.totalItems')}</span>
                <span className="stat-value">{totals?.totalItems || 0}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">{t('stats.totalErrors')}</span>
                <span className="stat-value danger">{totals?.totalErrors || 0}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">{t('stats.lastFullFetch')}</span>
                <span className="stat-value">
                  {formatDate(totals?.lastFullFetch || null, never, locale)}
                </span>
              </div>
            </div>
          </div>

          {/* Feed Health Table */}
          <div className="stats-section">
            <h3>{t('stats.feedHealth')}</h3>
            {feeds.length === 0 ? (
              <p className="empty">{t('stats.noFeedData')}</p>
            ) : (
              <div className="table-container">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th>{t('stats.colSource')}</th>
                      <th>{t('stats.colStatus')}</th>
                      <th>{t('stats.colLastFetch')}</th>
                      <th>{t('stats.colItems')}</th>
                      <th>{t('stats.colEtag')}</th>
                      <th>{t('stats.colLastError')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feeds.map((feed: FeedStat) => (
                      <tr key={feed.name}>
                        <td className="feed-name">{feed.name}</td>
                        <td>
                          <span className={`status-badge ${feed.lastStatus || 'unknown'}`}>
                            {feed.lastStatus === 'ok'
                              ? `✅ ${t('stats.ok')}`
                              : feed.lastStatus === 'error'
                                ? `❌ ${t('stats.errorWord')}`
                                : '⏳ --'}
                          </span>
                        </td>
                        <td>{formatDate(feed.lastFetch, never, locale)}</td>
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
