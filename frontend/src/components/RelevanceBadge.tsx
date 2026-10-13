interface RelevanceBadgeProps {
  score: number | undefined;
  size?: 'sm' | 'md';
}

export function RelevanceBadge({ score, size = 'md' }: RelevanceBadgeProps) {
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
    <span className={`relevance-badge ${colorClass} ${size}`} title={`Relevance: ${score}/100`}>
      {score}
    </span>
  );
}
