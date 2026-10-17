import { Languages } from 'lucide-react';
import { type Language, useI18n } from '../i18n';

export function LanguageSelector() {
  const { language, setLanguage, t } = useI18n();

  return (
    <label className="language-select" title={t('header.language')}>
      <Languages size={15} aria-hidden="true" />
      <select
        className="language-select-input"
        aria-label={t('header.language')}
        value={language}
        onChange={(e) => setLanguage(e.target.value as Language)}
      >
        <option value="pt">{t('lang.portuguese')}</option>
        <option value="en">{t('lang.english')}</option>
      </select>
    </label>
  );
}
