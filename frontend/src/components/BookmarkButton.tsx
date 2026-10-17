import { BookMarked, Bookmark } from 'lucide-react';
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
      {isBookmarked ? <BookMarked size={17} fill="currentColor" /> : <Bookmark size={17} />}
    </button>
  );
}
