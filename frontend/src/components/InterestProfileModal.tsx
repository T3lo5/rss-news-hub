import { X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { fetchProfile, updateProfile } from '../hooks/useRelevance';
import { useI18n } from '../i18n';
import type { InterestProfile } from '../types';
import { Status } from './Status';

export function InterestProfileModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  useEscapeKey(isOpen, onClose);
  const [profile, setProfile] = useState<InterestProfile>({
    keywords: [],
    topics: [],
    preferredSources: [],
    excludedKeywords: [],
    updatedAt: Date.now(),
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [newKeyword, setNewKeyword] = useState('');
  const [newTopic, setNewTopic] = useState('');
  const [newSource, setNewSource] = useState('');
  const [newExcluded, setNewExcluded] = useState('');

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchProfile();
      setProfile(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('profile.errLoad'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (isOpen) loadProfile();
  }, [isOpen, loadProfile]);

  const addItem = (field: keyof InterestProfile, value: string, setter: (v: string) => void) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (profile[field].includes(trimmed)) return;

    setProfile((prev) => ({
      ...prev,
      [field]: [...prev[field], trimmed],
    }));
    setter('');
  };

  const removeItem = (field: keyof InterestProfile, value: string) => {
    setProfile((prev) => ({
      ...prev,
      [field]: prev[field].filter((v) => v !== value),
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await updateProfile(profile);
      setSuccess(t('profile.saved'));
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('profile.errSave'));
    } finally {
      setSaving(false);
    }
  };

  const renderTagList = (
    field: keyof InterestProfile,
    label: string,
    placeholder: string,
    newValue: string,
    setNewValue: (v: string) => void
  ) => (
    <div className="form-group">
      <label>
        {label} ({profile[field].length})
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
        {profile[field].map((item, i) => (
          <span
            key={i}
            className="tag"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              padding: '4px 10px',
              borderRadius: '12px',
              fontSize: '13px',
            }}
          >
            {item}
            <button
              onClick={() => removeItem(field, item)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                padding: 0,
                fontSize: '14px',
                lineHeight: 1,
              }}
            >
              <X size={18} />
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <input
          type="text"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            addItem(field, newValue, setNewValue);
          }}
          placeholder={placeholder}
          style={{ flex: 1 }}
        />
        <button className="btn btn-sm" onClick={() => addItem(field, newValue, setNewValue)}>
          {t('profile.add')}
        </button>
      </div>
    </div>
  );

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-title"
    >
      <div
        className="modal"
        style={{ maxWidth: '700px', width: '95vw', maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 id="profile-title">{t('profile.title')}</h3>
          <button className="close-btn" onClick={onClose} aria-label={t('common.close')}>
            ×
          </button>
        </div>
        <div
          className="modal-body"
          style={{ padding: '20px', overflow: 'auto', maxHeight: '70vh' }}
        >
          {error && <Status message={error} type="error" onClose={() => setError(null)} />}
          {success && <Status message={success} type="success" />}

          <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '14px' }}>
            {t('profile.intro')}
          </p>

          {renderTagList(
            'keywords',
            t('profile.keywords'),
            t('profile.keywordsPlaceholder'),
            newKeyword,
            setNewKeyword
          )}
          {renderTagList(
            'topics',
            t('profile.topics'),
            t('profile.topicsPlaceholder'),
            newTopic,
            setNewTopic
          )}
          {renderTagList(
            'preferredSources',
            t('profile.preferredSources'),
            t('profile.sourcesPlaceholder'),
            newSource,
            setNewSource
          )}
          {renderTagList(
            'excludedKeywords',
            t('profile.excludedKeywords'),
            t('profile.excludedPlaceholder'),
            newExcluded,
            setNewExcluded
          )}

          <div
            className="modal-footer"
            style={{
              display: 'flex',
              gap: '10px',
              justifyContent: 'flex-end',
              marginTop: '20px',
              paddingTop: '16px',
              borderTop: '1px solid var(--border)',
            }}
          >
            <button className="btn btn-primary" onClick={handleSave} disabled={loading || saving}>
              {saving ? t('common.saving') : t('profile.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
