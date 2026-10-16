import { useI18n } from '../i18n';

interface RelevanceBadgeProps {
  score: number | undefined;
  size?: 'sm' | 'md';
}

export function RelevanceBadge({ score, size = 'md' }: RelevanceBadgeProps) {
  const { t } = useI18n();
  if (score === undefined || score === null) {
    return (
      <span className={`relevance-badge ${size}`} style={{ opacity: 0.4 }}>
        —
      </span>
    );
  }

  let colorClass = 'low';
  if (score >= 70) colorClass = 'high';
  else if (score >= 50) colorClass = 'medium';

  return (
    <span
      className={`relevance-badge ${colorClass} ${size}`}
      title={t('relevance.title', { score })}
    >
      {score}
    </span>
  );
}
