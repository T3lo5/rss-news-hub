import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import type { Template } from '../types';

interface TemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TemplatesModal({ isOpen, onClose }: TemplatesModalProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    type: 'thread' as 'thread' | 'summary' | 'linkedin' | 'blog' | 'newsletter',
    systemPrompt: '',
    variables: '' as string,
  });

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getTemplates();
      setTemplates(Array.isArray(data?.templates) ? data.templates : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar templates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
    }
  }, [isOpen, loadTemplates]);

  const handleOpenForm = (template?: Template) => {
    if (template) {
      setEditingTemplate(template);
      setFormData({
        id: template.id,
        name: template.name,
        type: template.type,
        systemPrompt: template.systemPrompt,
        variables: template.variables.join(', '),
      });
    } else {
      setEditingTemplate(null);
      setFormData({
        id: '',
        name: '',
        type: 'thread',
        systemPrompt: '',
        variables: '',
      });
    }
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingTemplate(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const templateData = {
        id: formData.id,
        name: formData.name,
        type: formData.type,
        systemPrompt: formData.systemPrompt,
        variables: formData.variables
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean),
      };

      if (editingTemplate) {
        await api.updateTemplate(editingTemplate.id, templateData);
      } else {
        await api.createTemplate(templateData);
      }
      handleCloseForm();
      loadTemplates();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar template');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este template?')) return;
    try {
      await api.deleteTemplate(id);
      loadTemplates();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao excluir template');
    }
  };

  const handleTest = async (template: Template) => {
    try {
      const result = await api.testTemplate(template.id, {});
      alert(`System Prompt gerado:\n\n${result.systemPrompt.substring(0, 500)}...`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao testar template');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal templates-modal"
        style={{ maxWidth: '900px', width: '95%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>📋 Gerenciar Templates</h2>
          <button className="btn-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        {showForm ? (
          <div className="modal-body">
            <form
              onSubmit={handleSubmit}
              style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
            >
              <div className="form-group">
                <label htmlFor="templateId">ID *</label>
                <input
                  id="templateId"
                  type="text"
                  value={formData.id}
                  onChange={(e) => setFormData((prev) => ({ ...prev, id: e.target.value }))}
                  required
                  disabled={Boolean(editingTemplate)}
                  placeholder="ex: meu-template-custom"
                />
                <small style={{ color: 'var(--text-muted)' }}>
                  Identificador único (não pode ser alterado após criação)
                </small>
              </div>

              <div className="form-group">
                <label htmlFor="templateName">Nome *</label>
                <input
                  id="templateName"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  required
                  placeholder="ex: Meu Template Personalizado"
                />
              </div>

              <div className="form-group">
                <label htmlFor="templateType">Tipo *</label>
                <select
                  id="templateType"
                  value={formData.type}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      type: e.target.value as typeof formData.type,
                    }))
                  }
                  required
                >
                  <option value="thread">🐦 Thread Twitter/X</option>
                  <option value="summary">📝 Resumo</option>
                  <option value="linkedin">💼 Post LinkedIn</option>
                  <option value="blog">📖 Post Blog</option>
                  <option value="newsletter">📰 Newsletter</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="templateVariables">Variáveis (separadas por vírgula)</label>
                <input
                  id="templateVariables"
                  type="text"
                  value={formData.variables}
                  onChange={(e) => setFormData((prev) => ({ ...prev, variables: e.target.value }))}
                  placeholder="ex: language, title, customVar"
                />
                <small style={{ color: 'var(--text-muted)' }}>
                  {'Use {{variable}} no systemPrompt'}
                </small>
              </div>

              <div className="form-group">
                <label htmlFor="templatePrompt">System Prompt *</label>
                <textarea
                  id="templatePrompt"
                  value={formData.systemPrompt}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, systemPrompt: e.target.value }))
                  }
                  required
                  rows={12}
                  style={{ fontFamily: 'monospace', fontSize: '13px' }}
                  placeholder="Escreva o prompt usando {{variable}} para substituição..."
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={handleCloseForm}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingTemplate ? 'Atualizar' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="modal-body">
            {error && (
              <div className="error" style={{ marginBottom: '16px' }}>
                Erro: {error}
              </div>
            )}

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
              }}
            >
              <h3>Templates ({(templates ?? []).length})</h3>
              <button className="btn btn-primary" onClick={() => handleOpenForm()}>
                <span role="img" aria-label="add">
                  ＋
                </span>{' '}
                Novo Template
              </button>
            </div>

            {loading ? (
              <div className="loading">Carregando templates...</div>
            ) : (templates ?? []).length === 0 ? (
              <p className="empty">Nenhum template encontrado.</p>
            ) : (
              <div className="table-container">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Nome</th>
                      <th>Tipo</th>
                      <th>Variáveis</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(templates ?? []).map((template) => (
                      <tr key={template.id}>
                        <td
                          className="feed-name"
                          style={{ fontFamily: 'monospace', fontSize: '12px' }}
                        >
                          {template.id}
                          {template.builtin && (
                            <span
                              style={{
                                marginLeft: '8px',
                                fontSize: '10px',
                                background: 'var(--primary)',
                                color: 'white',
                                padding: '1px 6px',
                                borderRadius: '3px',
                              }}
                            >
                              padrão
                            </span>
                          )}
                        </td>
                        <td>{template.name}</td>
                        <td>{template.type}</td>
                        <td>{template.variables.join(', ') || '-'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              className="btn btn-ghost"
                              onClick={() => handleOpenForm(template)}
                              style={{ padding: '4px 8px', fontSize: '12px' }}
                              disabled={template.builtin}
                            >
                              ✏️ Editar
                            </button>
                            <button
                              className="btn btn-ghost"
                              onClick={() => handleTest(template)}
                              style={{ padding: '4px 8px', fontSize: '12px' }}
                            >
                              🧪 Testar
                            </button>
                            {!template.builtin && (
                              <button
                                className="btn btn-ghost"
                                onClick={() => handleDelete(template.id)}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '12px',
                                  color: 'var(--danger)',
                                }}
                              >
                                🗑️ Excluir
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
