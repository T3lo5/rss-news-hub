import { useAiProviders } from '../hooks/useAiProviders';
import { useI18n } from '../i18n';
import type { AiProviderListItem, Provider } from '../types';

const DEFAULT_PROVIDERS: AiProviderListItem[] = [
  { id: 'sensenova', label: 'SenseNova', configured: true },
  { id: 'deepseek', label: 'DeepSeek', configured: true },
  { id: 'openai', label: 'OpenAI', configured: true },
];

interface ProviderSelectProps {
  value: Provider;
  onChange: (value: Provider) => void;
  id?: string;
  disabled?: boolean;
  autoLabel?: string;
}

// Shared AI provider dropdown. Uses GET /api/ai/providers so unconfigured
// providers are shown but disabled, instead of the old hardcoded list.
export function ProviderSelect({
  value,
  onChange,
  id,
  disabled,
  autoLabel,
}: ProviderSelectProps) {
  const { t } = useI18n();
  const list = useAiProviders(true);
  const providers = list?.providers ?? DEFAULT_PROVIDERS;
  const known = Boolean(list);

  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value as Provider)}
      disabled={disabled}
    >
      <option value="auto">{autoLabel ?? t('common.autoFirst')}</option>
      {providers.map((p) => (
        <option key={p.id} value={p.id} disabled={known && !p.configured}>
          {p.label}
          {known && !p.configured ? ` ${t('common.notConfigured')}` : ''}
        </option>
      ))}
    </select>
  );
}
