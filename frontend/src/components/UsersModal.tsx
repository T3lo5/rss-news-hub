import { X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useI18n } from '../i18n';
import { api } from '../services/api';
import type { User, UserRole } from '../types';
import { Status } from './Status';

interface UsersModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ROLES: UserRole[] = ['admin', 'user', 'viewer'];

export function UsersModal({ isOpen, onClose }: UsersModalProps) {
  const { user: currentUser } = useAuth();
  const { t } = useI18n();
  useEscapeKey(isOpen, onClose);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Create form
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('user');
  const [creating, setCreating] = useState(false);

  // Inline password reset
  const [passwordFor, setPasswordFor] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const flash = (message: string) => {
    setSuccess(message);
    setTimeout(() => setSuccess(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await api.getUsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : t('users.errLoad'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      load();
      setNewEmail('');
      setNewName('');
      setNewPassword('');
      setNewRole('user');
      setPasswordFor(null);
      setResetPassword('');
      setError(null);
      setSuccess(null);
    }
  }, [isOpen, load]);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      await api.createUser({
        email: newEmail.trim(),
        password: newPassword,
        name: newName.trim() || undefined,
        role: newRole,
      });
      setNewEmail('');
      setNewName('');
      setNewPassword('');
      setNewRole('user');
      flash(t('users.created'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('users.errCreate'));
    } finally {
      setCreating(false);
    }
  };

  const handleRoleChange = async (user: User, role: UserRole) => {
    setBusyId(user.id);
    setError(null);
    try {
      await api.updateUser(user.id, { role });
      flash(t('users.roleUpdated', { email: user.email }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('users.errRole'));
    } finally {
      setBusyId(null);
    }
  };

  const handleResetPassword = async (user: User) => {
    if (resetPassword.length < 8) {
      setError(t('users.passwordTooShort'));
      return;
    }
    setBusyId(user.id);
    setError(null);
    try {
      await api.updateUser(user.id, { password: resetPassword });
      setPasswordFor(null);
      setResetPassword('');
      flash(t('users.passwordReset', { email: user.email }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('users.errPassword'));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (user: User) => {
    if (!window.confirm(t('users.confirmDelete', { email: user.email }))) return;
    setBusyId(user.id);
    setError(null);
    try {
      await api.deleteUser(user.id);
      flash(t('users.deleted'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('users.errDelete'));
    } finally {
      setBusyId(null);
    }
  };

  if (!isOpen) return null;

  const canCreate = newEmail.trim().length > 0 && newPassword.length >= 8 && !creating;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="users-title"
    >
      <div
        className="modal"
        style={{ maxWidth: '820px', width: '95vw', maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 id="users-title">{t('users.title')}</h3>
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

          <section style={{ marginBottom: '28px' }}>
            <h4 style={{ marginBottom: '12px' }}>{t('users.createTitle')}</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ flex: '1 1 200px', margin: 0 }}>
                <label htmlFor="newUserEmail">{t('common.email')}</label>
                <input
                  id="newUserEmail"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="pessoa@exemplo.com"
                />
              </div>
              <div className="form-group" style={{ flex: '1 1 160px', margin: 0 }}>
                <label htmlFor="newUserName">{t('users.nameOptional')}</label>
                <input
                  id="newUserName"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div className="form-group" style={{ flex: '1 1 160px', margin: 0 }}>
                <label htmlFor="newUserPassword">{t('common.password')}</label>
                <input
                  id="newUserPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t('users.passwordPlaceholder')}
                />
              </div>
              <div className="form-group" style={{ flex: '0 0 130px', margin: 0 }}>
                <label htmlFor="newUserRole">{t('common.role')}</label>
                <select
                  id="newUserRole"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {t(`role.${role}`)}
                    </option>
                  ))}
                </select>
              </div>
              <button className="btn btn-primary" onClick={handleCreate} disabled={!canCreate}>
                {creating ? t('common.creating') : t('common.create')}
              </button>
            </div>
          </section>

          <section>
            <h4 style={{ marginBottom: '12px' }}>{t('users.list', { count: users.length })}</h4>
            {loading && users.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>{t('common.loading')}</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '8px 6px' }}>{t('common.email')}</th>
                    <th style={{ padding: '8px 6px' }}>{t('common.name')}</th>
                    <th style={{ padding: '8px 6px' }}>{t('common.role')}</th>
                    <th style={{ padding: '8px 6px' }}>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const isSelf = user.id === currentUser?.id;
                    return (
                      <tr key={user.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '8px 6px' }}>
                          {user.email}
                          {isSelf && (
                            <span
                              style={{
                                marginLeft: '6px',
                                fontSize: '11px',
                                color: 'var(--text-secondary)',
                              }}
                            >
                              {t('users.you')}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '8px 6px' }}>{user.name || '—'}</td>
                        <td style={{ padding: '8px 6px' }}>
                          <select
                            value={user.role}
                            onChange={(e) => handleRoleChange(user, e.target.value as UserRole)}
                            disabled={isSelf || busyId === user.id}
                            title={isSelf ? t('users.selfRoleHint') : undefined}
                          >
                            {ROLES.map((role) => (
                              <option key={role} value={role}>
                                {t(`role.${role}`)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '8px 6px' }}>
                          {passwordFor === user.id ? (
                            <span
                              style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}
                            >
                              <input
                                type="password"
                                value={resetPassword}
                                onChange={(e) => setResetPassword(e.target.value)}
                                placeholder={t('users.newPasswordPlaceholder')}
                                style={{ width: '130px' }}
                              />
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => handleResetPassword(user)}
                                disabled={busyId === user.id}
                              >
                                {t('common.save')}
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => {
                                  setPasswordFor(null);
                                  setResetPassword('');
                                }}
                              >
                                {t('common.cancel')}
                              </button>
                            </span>
                          ) : (
                            <span style={{ display: 'inline-flex', gap: '6px' }}>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => {
                                  setPasswordFor(user.id);
                                  setResetPassword('');
                                }}
                              >
                                {t('users.passwordBtn')}
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => handleDelete(user)}
                                disabled={isSelf || busyId === user.id}
                                title={isSelf ? t('users.selfDeleteHint') : undefined}
                              >
                                {t('common.delete')}
                              </button>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
