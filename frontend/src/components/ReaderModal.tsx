import { ExternalLink, Mail, MailOpen, Share2, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useI18n } from '../i18n';
import type { NewsItem } from '../types';
import { cleanDescription } from '../utils/content';
import { BookmarkButton } from './BookmarkButton';

interface ReaderModalProps {
  item: NewsItem;
  isBookmarked: boolean;
  /** Offline snapshot: read state and bookmarks cannot be written. */
  readOnly?: boolean;
  onClose: () => void;
  onToggleBookmark: (id: string, next: boolean) => void;
  onReadToggle: (item: NewsItem, read: boolean) => void;
  onShare: (item: NewsItem) => void;
}

/**
 * Leitor interno: mostra o texto que já veio no RSS, sem buscar a página
 * original. Nada aqui dispara requisição externa — nem imagens — então o
 * leitor funciona offline e não abre abas.
 *
 * O HTML do feed nunca é injetado: `cleanDescription()` remove as tags e o
 * resultado é renderizado como texto.
 */
export function ReaderModal({
  item,
  isBookmarked,
  readOnly = false,
  onClose,
  onToggleBookmark,
  onReadToggle,
  onShare,
}: ReaderModalProps) {
  const { t, language } = useI18n();
  const dialogRef = useRef<HTMLDivElement>(null);
  useEscapeKey(true, onClose);

  // Focus trap: o leitor é uma camada modal, então o Tab não pode escapar
  // para o header/cards atrás dele. Ao fechar, devolve o foco ao card.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => element.offsetParent !== null);

    dialog.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      const elements = focusable();
      if (elements.length === 0) {
        event.preventDefault();
        return;
      }

      const first = elements[0];
      const last = elements[elements.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    dialog.addEventListener('keydown', onKeyDown);
    return () => {
      dialog.removeEventListener('keydown', onKeyDown);
      previous?.focus?.();
    };
  }, []);

  const locale = language === 'en' ? 'en-US' : 'pt-BR';
  const isRead = Boolean(item.readAt);
  const body = cleanDescription(item.description || '') || cleanDescription(item.content || '');

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(locale, {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="modal-overlay reader-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="modal reader-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reader-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header reader-header">
          <div className="reader-byline">
            <span className="news-source">{item.source || t('news.unknownSource')}</span>
            <time dateTime={item.pubDate}>{formatDate(item.pubDate)}</time>
          </div>
          <button className="close-btn" onClick={onClose} aria-label={t('common.close')}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body reader-body">
          <h2 id="reader-title" className="reader-title">
            {item.title}
          </h2>

          <div className="reader-text">
            {body || <span className="muted">{t('news.noDescription')}</span>}
          </div>

          <p className="reader-truncated">
            {t('reader.truncated')}{' '}
            <a href={item.link} target="_blank" rel="noopener noreferrer">
              {t('reader.readInSource')}
            </a>
          </p>
        </div>

        <div className="modal-footer reader-actions">
          <button
            className="btn btn-read"
            onClick={() => onReadToggle(item, !isRead)}
            disabled={readOnly}
            aria-label={t(isRead ? 'news.markUnreadAria' : 'news.markReadAria', {
              title: item.title,
            })}
            title={t(isRead ? 'news.markUnread' : 'news.markRead')}
          >
            {isRead ? <MailOpen size={17} /> : <Mail size={17} />}
            <span className="btn-label">{t(isRead ? 'news.markUnread' : 'news.markRead')}</span>
          </button>

          <BookmarkButton
            newsId={item.id}
            isBookmarked={isBookmarked}
            onToggle={onToggleBookmark}
            disabled={readOnly}
          />

          <button className="btn btn-share" onClick={() => onShare(item)}>
            <Share2 size={15} />
            <span className="btn-label">{t('news.share')}</span>
          </button>

          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary reader-original"
          >
            <ExternalLink size={15} />
            <span className="btn-label">{t('reader.openOriginal')}</span>
          </a>
        </div>
      </div>
    </div>
  );
}
