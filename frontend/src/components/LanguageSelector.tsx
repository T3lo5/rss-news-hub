import { type Language, useI18n } from '../i18n';

export function LanguageSelector() {
  const { language, setLanguage, t } = useI18n();

  return (
    <select
      className="language-select"
      aria-label={t('header.language')}
      title={t('header.language')}
      value={language}
      onChange={(e) => setLanguage(e.target.value as Language)}
    >
      <option value="pt">🇧🇷 PT</option>
      <option value="en">🇺🇸 EN</option>
    </select>
  );
}
