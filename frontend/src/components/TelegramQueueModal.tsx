import { X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useI18n } from '../i18n';
import { api } from '../services/api';
import type { TelegramQueueItem, TelegramWorkerStatus } from '../types';
import { Status } from './Status';

interface TelegramQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatWhen(value?: number | string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

export function TelegramQueueModal({ isOpen, onClose }: TelegramQueueModalProps) {
  const { user } = useAuth();
  const { t } = useI18n();
  useEscapeKey(isOpen, onClose);
  const isAdmin = user?.role === 'admin';

  const [queue, setQueue] = useState<TelegramQueueItem[]>([]);
  const [status, setStatus] = useState<TelegramWorkerStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const flash = (message: string) => {
    setSuccess(message);
    setTimeout(() => setSuccess(null), 3000);
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      const [items, worker] = await Promise.all([
        api.getTelegramQueue(),
        api.getTelegramWorkerStatus(),
      ]);
      setQueue(items);
      setStatus(worker);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('queue.errLoad'));
    }
  }, [t]);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    load().finally(() => setLoading(false));
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [isOpen, load]);

  const handleCancel = async (item: TelegramQueueItem) => {
    setBusy(true);
    setError(null);
    try {
      await api.cancelTelegramQueued(item.id);
      flash(t('queue.cancelled'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('queue.errCancel'));
    } finally {
      setBusy(false);
    }
  };

  const handleProcess = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.processTelegramQueue();
      flash(t('queue.processed'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('queue.errProcess'));
    } finally {
      setBusy(false);
    }
  };

  const handleToggleWorker = async () => {
    setBusy(true);
    setError(null);
    try {
      const worker = status?.running
        ? await api.stopTelegramWorker()
        : await api.startTelegramWorker();
      setStatus(worker);
      flash(worker.running ? t('queue.workerStarted') : t('queue.workerStopped'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('queue.errWorker'));
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="telegram-queue-title"
    >
      <div
        className="modal"
        style={{ maxWidth: '780px', width: '95vw', maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 id="telegram-queue-title">{t('queue.title')}</h3>
          <button className="close-btn" onClick={onClose} aria-label={t('common.close')}>
            <X size={18} />
          </button>
        </div>
        <div
          className="modal-body"
          style={{ padding: '20px', overflow: 'auto', maxHeight: '75vh' }}
        >
          {error && <Status message={error} type="error" onClose={() => setError(null)} />}
          {success && <Status message={success} type="success" />}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap',
              marginBottom: '20px',
            }}
          >
            <span className={`scheduler-badge ${status?.running ? 'running' : 'stopped'}`}>
              {status?.running ? t('queue.workerOn') : t('queue.workerOff')}
            </span>
            <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              {t('queue.count', { count: queue.length })}
              {status?.isProcessing ? ` · ${t('queue.processing')}` : ''}
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
              <button className="btn btn-secondary btn-sm" onClick={handleProcess} disabled={busy}>
                {t('queue.processNow')}
              </button>
              {isAdmin && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleToggleWorker}
                  disabled={busy}
                >
                  {status?.running ? t('queue.stopWorker') : t('queue.startWorker')}
                </button>
              )}
            </div>
          </div>

          {loading && queue.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>{t('common.loading')}</p>
          ) : queue.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>{t('queue.empty')}</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '8px 6px' }}>{t('queue.colMessage')}</th>
                  <th style={{ padding: '8px 6px' }}>{t('queue.colScheduled')}</th>
                  <th style={{ padding: '8px 6px' }}>{t('queue.colStatus')}</th>
                  <th style={{ padding: '8px 6px' }} />
                </tr>
              </thead>
              <tbody>
                {queue.map((item) => (
                  <tr key={item.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '8px 6px', maxWidth: '320px' }}>
                      <span
                        title={item.text}
                        style={{
                          display: 'inline-block',
                          maxWidth: '320px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          verticalAlign: 'bottom',
                        }}
                      >
                        {item.text}
                      </span>
                      {item.lastError && (
                        <div style={{ fontSize: '11px', color: 'var(--danger)' }}>
                          {item.lastError}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '8px 6px' }}>{formatWhen(item.scheduledAt)}</td>
                    <td style={{ padding: '8px 6px' }}>
                      {item.status
                        ? t(
                            `queue.status${item.status.charAt(0).toUpperCase()}${item.status.slice(1)}`
                          )
                        : '—'}
                      {item.retryCount ? ` (${item.retryCount})` : ''}
                    </td>
                    <td style={{ padding: '8px 6px' }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleCancel(item)}
                        disabled={busy}
                      >
                        {t('common.cancel')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
