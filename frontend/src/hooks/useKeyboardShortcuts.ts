import { useCallback, useEffect, useRef } from 'react';

interface ShortcutHandler {
  key: string;
  description: string;
  handler: () => void;
  preventDefault?: boolean;
  disabledInInputs?: boolean;
}

interface UseKeyboardShortcutsOptions {
  shortcuts: ShortcutHandler[];
  enabled?: boolean;
}

export function useKeyboardShortcuts({ shortcuts, enabled = true }: UseKeyboardShortcutsOptions) {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      const target = event.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;

      for (const shortcut of shortcutsRef.current) {
        const match = event.key.toLowerCase() === shortcut.key.toLowerCase();

        if (!match) continue;

        if (shortcut.disabledInInputs && isInput) {
          return;
        }

        if (shortcut.preventDefault) {
          event.preventDefault();
        }

        shortcut.handler();
        break;
      }
    },
    [enabled]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return shortcutsRef.current;
}
