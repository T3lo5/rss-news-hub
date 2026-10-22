import { useI18n } from '../i18n';

interface RelevanceBadgeProps {
  score: number | undefined;
  size?: 'sm' | 'md';
}

export function RelevanceBadge({ score, size = 'md' }: RelevanceBadgeProps) {
  const { t } = useI18n();

  // Nothing to show when the item has not been scored — avoid an empty chip.
  if (score === undefined || score === null) return null;

  let colorClass = 'low';
  if (score >= 70) colorClass = 'high';
  else if (score >= 50) colorClass = 'medium';

  return (
    <span
      className={`relevance-badge ${colorClass} ${size}`}
      title={t('relevance.title', { score })}
    >
      {score}
      <span className="relevance-max" aria-hidden="true">
        /100
      </span>
    </span>
  );
}
