import { useI18n } from '../i18n';

interface BookmarkButtonProps {
  newsId: string;
  isBookmarked: boolean;
  onToggle: (newsId: string, isBookmarked: boolean) => void;
  disabled?: boolean;
}

export function BookmarkButton({ newsId, isBookmarked, onToggle, disabled }: BookmarkButtonProps) {
  const { t } = useI18n();
  return (
    <button
      className={`bookmark-btn ${isBookmarked ? 'bookmarked' : ''}`}
      onClick={() => !disabled && onToggle(newsId, !isBookmarked)}
      disabled={disabled}
      aria-label={isBookmarked ? t('bookmark.removeAria') : t('bookmark.addAria')}
      aria-pressed={isBookmarked}
      title={isBookmarked ? t('bookmark.removeTitle') : t('bookmark.saveTitle')}
    >
      {isBookmarked ? (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      ) : (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      )}
    </button>
  );
}
