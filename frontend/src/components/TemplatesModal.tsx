import { Plus, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useI18n } from '../i18n';
import { api } from '../services/api';
import type { Template } from '../types';

interface TemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TemplatesModal({ isOpen, onClose }: TemplatesModalProps) {
  const { t } = useI18n();
  useEscapeKey(isOpen, onClose);
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
      setError(e instanceof Error ? e.message : t('templates.errLoad'));
    } finally {
      setLoading(false);
    }
  }, [t]);

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
      setError(e instanceof Error ? e.message : t('templates.errSave'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('templates.confirmDelete'))) return;
    try {
      await api.deleteTemplate(id);
      loadTemplates();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('templates.errDelete'));
    }
  };

  const handleTest = async (template: Template) => {
    try {
      const result = await api.testTemplate(template.id, {});
      alert(t('templates.testAlert', { prompt: result.systemPrompt.substring(0, 500) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('templates.errTest'));
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
          <h2>{t('templates.title')}</h2>
          <button className="btn-close" onClick={onClose} aria-label={t('common.close')}>
            <X size={18} />
          </button>
        </div>

        {showForm ? (
          <div className="modal-body">
            <form
              onSubmit={handleSubmit}
              style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
            >
              <div className="form-group">
                <label htmlFor="templateId">{t('templates.idLabel')}</label>
                <input
                  id="templateId"
                  type="text"
                  value={formData.id}
                  onChange={(e) => setFormData((prev) => ({ ...prev, id: e.target.value }))}
                  required
                  disabled={Boolean(editingTemplate)}
                  placeholder={t('templates.idPlaceholder')}
                />
                <small style={{ color: 'var(--text-muted)' }}>{t('templates.idHint')}</small>
              </div>

              <div className="form-group">
                <label htmlFor="templateName">{t('templates.nameLabel')}</label>
                <input
                  id="templateName"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  required
                  placeholder={t('templates.namePlaceholder')}
                />
              </div>

              <div className="form-group">
                <label htmlFor="templateType">{t('templates.typeLabel')}</label>
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
                  <option value="thread">{t('templates.typeThread')}</option>
                  <option value="summary">{t('templates.typeSummary')}</option>
                  <option value="linkedin">{t('templates.typeLinkedin')}</option>
                  <option value="blog">{t('templates.typeBlog')}</option>
                  <option value="newsletter">{t('templates.typeNewsletter')}</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="templateVariables">{t('templates.varsLabel')}</label>
                <input
                  id="templateVariables"
                  type="text"
                  value={formData.variables}
                  onChange={(e) => setFormData((prev) => ({ ...prev, variables: e.target.value }))}
                  placeholder={t('templates.varsPlaceholder')}
                />
                <small style={{ color: 'var(--text-muted)' }}>{t('templates.varsHint')}</small>
              </div>

              <div className="form-group">
                <label htmlFor="templatePrompt">{t('templates.promptLabel')}</label>
                <textarea
                  id="templatePrompt"
                  value={formData.systemPrompt}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, systemPrompt: e.target.value }))
                  }
                  required
                  rows={12}
                  style={{ fontFamily: 'monospace', fontSize: '13px' }}
                  placeholder={t('templates.promptPlaceholder')}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={handleCloseForm}>
                  {t('common.cancel')}
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingTemplate ? t('templates.update') : t('common.create')}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="modal-body">
            {error && (
              <div className="error" style={{ marginBottom: '16px' }}>
                {t('templates.errorPrefix', { error })}
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
              <h3>{t('templates.list', { count: (templates ?? []).length })}</h3>
              <button className="btn btn-primary" onClick={() => handleOpenForm()}>
                <Plus size={15} />
                {t('templates.new')}
              </button>
            </div>

            {loading ? (
              <div className="loading">{t('templates.loading')}</div>
            ) : (templates ?? []).length === 0 ? (
              <p className="empty">{t('templates.empty')}</p>
            ) : (
              <div className="table-container">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th>{t('templates.colId')}</th>
                      <th>{t('common.name')}</th>
                      <th>{t('templates.colType')}</th>
                      <th>{t('templates.colVars')}</th>
                      <th>{t('common.actions')}</th>
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
                              {t('templates.builtin')}
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
                              {t('templates.edit')}
                            </button>
                            <button
                              className="btn btn-ghost"
                              onClick={() => handleTest(template)}
                              style={{ padding: '4px 8px', fontSize: '12px' }}
                            >
                              {t('templates.test')}
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
                                {t('templates.delete')}
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
