import { useEffect, useRef } from 'react';

/**
 * Prende o foco dentro de um diálogo modal e o devolve a quem o abriu.
 *
 * Mesmo comportamento de referência do `ReaderModal` (que já fazia isso certo):
 * ao montar, foca o painel; enquanto aberto, Tab/Shift+Tab não escapam para o
 * header/cards atrás do overlay; ao desmontar, devolve o foco ao elemento que
 * abriu o modal. Uso: `const dialogRef = useModalFocus<HTMLDivElement>(isOpen)`
 * e `ref={dialogRef} tabIndex={-1}` no painel `.modal`.
 *
 * O painel precisa de `tabIndex={-1}` para poder receber foco programático.
 */
export function useModalFocus<T extends HTMLElement>(active: boolean) {
  const dialogRef = useRef<T | null>(null);

  useEffect(() => {
    if (!active) return;
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
      const focused = document.activeElement;

      // Fora do painel também é tratado como "na borda": se o foco escapou por
      // qualquer motivo, o próximo Tab volta para dentro.
      if (
        event.shiftKey &&
        (focused === first || focused === dialog || !dialog.contains(focused))
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (focused === last || !dialog.contains(focused))) {
        event.preventDefault();
        first.focus();
      }
    };

    dialog.addEventListener('keydown', onKeyDown);
    return () => {
      dialog.removeEventListener('keydown', onKeyDown);
      previous?.focus?.();
    };
  }, [active]);

  return dialogRef;
}
