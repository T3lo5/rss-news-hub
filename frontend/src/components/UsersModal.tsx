import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import type { User, UserRole } from '../types';

interface UsersModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ROLES: UserRole[] = ['admin', 'user', 'viewer'];

const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Admin',
  user: 'Usuário',
  viewer: 'Leitor',
};

export function UsersModal({ isOpen, onClose }: UsersModalProps) {
  const { user: currentUser } = useAuth();
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
      setError(err instanceof Error ? err.message : 'Falha ao carregar usuários');
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
      flash('Usuário criado!');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar usuário');
    } finally {
      setCreating(false);
    }
  };

  const handleRoleChange = async (user: User, role: UserRole) => {
    setBusyId(user.id);
    setError(null);
    try {
      await api.updateUser(user.id, { role });
      flash(`Papel de ${user.email} atualizado.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar papel');
    } finally {
      setBusyId(null);
    }
  };

  const handleResetPassword = async (user: User) => {
    if (resetPassword.length < 8) {
      setError('A nova senha precisa ter ao menos 8 caracteres.');
      return;
    }
    setBusyId(user.id);
    setError(null);
    try {
      await api.updateUser(user.id, { password: resetPassword });
      setPasswordFor(null);
      setResetPassword('');
      flash(`Senha de ${user.email} redefinida.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao redefinir senha');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (user: User) => {
    if (!window.confirm(`Excluir ${user.email}? Esta ação não pode ser desfeita.`)) return;
    setBusyId(user.id);
    setError(null);
    try {
      await api.deleteUser(user.id);
      flash('Usuário excluído.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir usuário');
    } finally {
      setBusyId(null);
    }
  };

  if (!isOpen) return null;

  const canCreate =
    newEmail.trim().length > 0 && newPassword.length >= 8 && !creating;

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
          <h3 id="users-title">👥 Usuários</h3>
          <button className="close-btn" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <div
          className="modal-body"
          style={{ padding: '20px', overflow: 'auto', maxHeight: '75vh' }}
        >
          {error && (
            <div className="status error" style={{ marginBottom: '16px' }}>
              {error}
            </div>
          )}
          {success && (
            <div className="status success" style={{ marginBottom: '16px' }}>
              {success}
            </div>
          )}

          <section style={{ marginBottom: '28px' }}>
            <h4 style={{ marginBottom: '12px' }}>Criar usuário</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ flex: '1 1 200px', margin: 0 }}>
                <label htmlFor="newUserEmail">E-mail</label>
                <input
                  id="newUserEmail"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="pessoa@exemplo.com"
                />
              </div>
              <div className="form-group" style={{ flex: '1 1 160px', margin: 0 }}>
                <label htmlFor="newUserName">Nome (opcional)</label>
                <input
                  id="newUserName"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div className="form-group" style={{ flex: '1 1 160px', margin: 0 }}>
                <label htmlFor="newUserPassword">Senha</label>
                <input
                  id="newUserPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="mín. 8 caracteres"
                />
              </div>
              <div className="form-group" style={{ flex: '0 0 130px', margin: 0 }}>
                <label htmlFor="newUserRole">Papel</label>
                <select
                  id="newUserRole"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABEL[role]}
                    </option>
                  ))}
                </select>
              </div>
              <button className="btn btn-primary" onClick={handleCreate} disabled={!canCreate}>
                {creating ? 'Criando…' : 'Criar'}
              </button>
            </div>
          </section>

          <section>
            <h4 style={{ marginBottom: '12px' }}>Usuários ({users.length})</h4>
            {loading && users.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>Carregando…</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '8px 6px' }}>E-mail</th>
                    <th style={{ padding: '8px 6px' }}>Nome</th>
                    <th style={{ padding: '8px 6px' }}>Papel</th>
                    <th style={{ padding: '8px 6px' }}>Ações</th>
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
                              style={{ marginLeft: '6px', fontSize: '11px', color: 'var(--text-secondary)' }}
                            >
                              (você)
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '8px 6px' }}>{user.name || '—'}</td>
                        <td style={{ padding: '8px 6px' }}>
                          <select
                            value={user.role}
                            onChange={(e) => handleRoleChange(user, e.target.value as UserRole)}
                            disabled={isSelf || busyId === user.id}
                            title={isSelf ? 'Você não pode alterar o próprio papel' : undefined}
                          >
                            {ROLES.map((role) => (
                              <option key={role} value={role}>
                                {ROLE_LABEL[role]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '8px 6px' }}>
                          {passwordFor === user.id ? (
                            <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                              <input
                                type="password"
                                value={resetPassword}
                                onChange={(e) => setResetPassword(e.target.value)}
                                placeholder="nova senha"
                                style={{ width: '130px' }}
                              />
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => handleResetPassword(user)}
                                disabled={busyId === user.id}
                              >
                                Salvar
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => {
                                  setPasswordFor(null);
                                  setResetPassword('');
                                }}
                              >
                                Cancelar
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
                                Senha
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => handleDelete(user)}
                                disabled={isSelf || busyId === user.id}
                                title={isSelf ? 'Você não pode excluir a si mesmo' : undefined}
                              >
                                Excluir
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
