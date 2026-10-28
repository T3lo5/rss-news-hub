import { Activity, Cpu, Database, HardDrive, RefreshCw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useI18n } from '../i18n';
import { api } from '../services/api';

interface MetricsModalProps {
  onClose: () => void;
}

interface ParsedMetrics {
  requestsTotal: number;
  requestsByStatus: Record<string, number>;
  requestsByMethod: Record<string, number>;
  uptime: number;
  memoryRss: number;
  memoryHeapUsed: number;
  memoryHeapTotal: number;
  dbItems: Record<string, number>;
  schedulers: Record<string, number>;
  aiProviders: string[];
}

function parsePrometheus(text: string): ParsedMetrics {
  const result: ParsedMetrics = {
    requestsTotal: 0,
    requestsByStatus: {},
    requestsByMethod: {},
    uptime: 0,
    memoryRss: 0,
    memoryHeapUsed: 0,
    memoryHeapTotal: 0,
    dbItems: {},
    schedulers: {},
    aiProviders: [],
  };

  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(\w+)(?:\{([^}]*)\})?\s+(.+)$/);
    if (!match) continue;
    const [, name, labels, value] = match;
    const numValue = parseFloat(value);

    switch (name) {
      case 'rss_news_hub_requests_total':
        result.requestsTotal = numValue;
        break;
      case 'rss_news_hub_requests_by_status': {
        const statusMatch = labels?.match(/status="([^"]+)"/);
        if (statusMatch) result.requestsByStatus[statusMatch[1]] = numValue;
        break;
      }
      case 'rss_news_hub_requests_by_method': {
        const methodMatch = labels?.match(/method="([^"]+)"/);
        if (methodMatch) result.requestsByMethod[methodMatch[1]] = numValue;
        break;
      }
      case 'rss_news_hub_uptime_seconds':
        result.uptime = numValue;
        break;
      case 'rss_news_hub_memory_bytes': {
        const typeMatch = labels?.match(/type="([^"]+)"/);
        if (typeMatch) {
          if (typeMatch[1] === 'rss') result.memoryRss = numValue;
          else if (typeMatch[1] === 'heap_used') result.memoryHeapUsed = numValue;
          else if (typeMatch[1] === 'heap_total') result.memoryHeapTotal = numValue;
        }
        break;
      }
      case 'rss_news_hub_db_items': {
        const tableMatch = labels?.match(/table="([^"]+)"/);
        if (tableMatch) result.dbItems[tableMatch[1]] = numValue;
        break;
      }
      case 'rss_news_hub_scheduler_running': {
        const nameMatch = labels?.match(/name="([^"]+)"/);
        if (nameMatch) result.schedulers[nameMatch[1]] = numValue;
        break;
      }
      case 'rss_news_hub_ai_provider_configured': {
        const providerMatch = labels?.match(/provider="([^"]+)"/);
        if (providerMatch) result.aiProviders.push(providerMatch[1]);
        break;
      }
    }
  }

  return result;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUptime(seconds: number): string {
  const total = Math.floor(seconds);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function MetricsModal({ onClose }: MetricsModalProps) {
  const { t } = useI18n();
  useEscapeKey(true, onClose);
  const [metrics, setMetrics] = useState<ParsedMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const text = await api.getMetrics();
      setMetrics(parsePrometheus(text));
      setLastUpdate(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('metrics.errLoad'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, []);

  const header = (
    <div className="modal-header">
      <h2>{t('metrics.title')}</h2>
      <button className="btn-close" onClick={onClose} aria-label={t('common.close')}>
        <X size={18} />
      </button>
    </div>
  );

  if (loading && !metrics) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal metrics-modal" onClick={(e) => e.stopPropagation()}>
          {header}
          <div className="modal-body">
            <div className="loading">{t('metrics.loading')}</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal metrics-modal" onClick={(e) => e.stopPropagation()}>
          {header}
          <div className="modal-body">
            <div className="error">{error}</div>
          </div>
        </div>
      </div>
    );
  }

  if (!metrics) return null;

  const statusColors: Record<string, string> = {
    '2xx': 'var(--success)',
    '3xx': 'var(--info)',
    '4xx': 'var(--warning)',
    '5xx': 'var(--danger)',
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal metrics-modal" onClick={(e) => e.stopPropagation()}>
        {header}

        <div className="modal-body">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}
          >
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {lastUpdate ? `Atualizado: ${lastUpdate.toLocaleTimeString()}` : ''}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={fetchMetrics} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
            </button>
          </div>

          {/* Application Metrics */}
          <div className="stats-section">
            <h3>
              <Activity size={16} style={{ marginRight: '8px' }} />
              {t('metrics.application')}
            </h3>
            <div className="stats-grid">
              <div className="stat-card">
                <span className="stat-label">{t('metrics.uptime')}</span>
                <span className="stat-value">{formatUptime(metrics.uptime)}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">{t('metrics.memoryRss')}</span>
                <span className="stat-value">{formatBytes(metrics.memoryRss)}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">{t('metrics.memoryHeap')}</span>
                <span className="stat-value">
                  {formatBytes(metrics.memoryHeapUsed)} / {formatBytes(metrics.memoryHeapTotal)}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-label">{t('metrics.requestsTotal')}</span>
                <span className="stat-value">{metrics.requestsTotal}</span>
              </div>
            </div>
          </div>

          {/* Request Status */}
          <div className="stats-section">
            <h3>
              <Cpu size={16} style={{ marginRight: '8px' }} />
              {t('metrics.requestsByStatus')}
            </h3>
            <div className="stats-grid">
              {Object.entries(metrics.requestsByStatus).map(([status, count]) => (
                <div className="stat-card" key={status}>
                  <span className="stat-label">{status}</span>
                  <span className="stat-value" style={{ color: statusColors[status] || 'inherit' }}>
                    {count}
                  </span>
                </div>
              ))}
              {Object.keys(metrics.requestsByStatus).length === 0 && (
                <div className="stat-card">
                  <span className="stat-value">0</span>
                </div>
              )}
            </div>
          </div>

          {/* Database Items */}
          <div className="stats-section">
            <h3>
              <Database size={16} style={{ marginRight: '8px' }} />
              {t('metrics.database')}
            </h3>
            <div className="stats-grid">
              {Object.entries(metrics.dbItems).map(([table, count]) => (
                <div className="stat-card" key={table}>
                  <span className="stat-label">{table}</span>
                  <span className="stat-value">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Schedulers */}
          <div className="stats-section">
            <h3>
              <HardDrive size={16} style={{ marginRight: '8px' }} />
              {t('metrics.schedulers')}
            </h3>
            <div className="stats-grid">
              {Object.entries(metrics.schedulers).map(([name, running]) => (
                <div className="stat-card" key={name}>
                  <span className="stat-label">{name}</span>
                  <span className={`stat-value ${running ? 'success' : 'danger'}`}>
                    {running ? t('stats.running') : t('stats.stopped')}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* AI Providers */}
          {metrics.aiProviders.length > 0 && (
            <div className="stats-section">
              <h3>{t('metrics.aiProviders')}</h3>
              <div className="stats-grid">
                {metrics.aiProviders.map((provider) => (
                  <div className="stat-card" key={provider}>
                    <span className="stat-value success">{provider}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
