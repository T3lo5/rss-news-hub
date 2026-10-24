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
        // "shift+r" declara modificador e exige combinação exata; atalhos
        // simples ("j", "m") continuam disparando com qualquer estado de Shift,
        // como antes — ninguém digita segurando Shift para escrever em minúsculas.
        const combo = shortcut.key
          .toLowerCase()
          .split('+')
          .map((part) => part.trim());
        const keyPart = combo[combo.length - 1];
        const mods = new Set(combo.slice(0, -1));
        const declaredModifiers = combo.length > 1;

        const matchKey = event.key.toLowerCase() === keyPart;
        const matchModifiers =
          !declaredModifiers ||
          (event.shiftKey === mods.has('shift') &&
            event.ctrlKey === (mods.has('ctrl') || mods.has('control')) &&
            event.altKey === mods.has('alt') &&
            event.metaKey === (mods.has('meta') || mods.has('cmd')));

        if (!matchKey || !matchModifiers) continue;

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
