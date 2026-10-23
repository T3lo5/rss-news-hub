import { useEffect, useRef } from 'react';

/**
 * Dialog layers currently mounted, innermost last. Keeping a stack means Esc
 * closes only the topmost dialog (e.g. the feed form opened on top of the feed
 * manager) and body scroll stays locked until the last one unmounts.
 */
const layers: symbol[] = [];

/**
 * Closes a dialog when the user presses Escape. Pass the same `active` flag the
 * dialog uses to decide whether it renders.
 */
export function useEscapeKey(active: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;

    const layer = Symbol('modal-layer');
    layers.push(layer);
    if (layers.length === 1) {
      document.body.style.overflow = 'hidden';
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (layers[layers.length - 1] !== layer) return;
      // Keeps the app-level shortcut handler from also reacting to this Esc.
      event.stopPropagation();
      onCloseRef.current();
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const index = layers.indexOf(layer);
      if (index !== -1) layers.splice(index, 1);
      if (layers.length === 0) {
        document.body.style.overflow = '';
      }
    };
  }, [active]);
}
