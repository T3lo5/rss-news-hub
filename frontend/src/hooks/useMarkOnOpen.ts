import { useCallback, useEffect, useState } from 'react';

const KEY = 'reading:markOnOpen';
const EVENT = 'reading:mark-on-open';

/** "Marcar ao abrir" é preferência de interface: fica no dispositivo, como o tema. */
export function readMarkOnOpen(): boolean {
  if (typeof localStorage === 'undefined') return true;
  try {
    return localStorage.getItem(KEY) !== 'false';
  } catch {
    return true;
  }
}

export function useMarkOnOpen() {
  const [markOnOpen, setMarkOnOpen] = useState(readMarkOnOpen);

  useEffect(() => {
    const sync = () => setMarkOnOpen(readMarkOnOpen());
    // `storage` cobre outra aba; o evento próprio cobre o mesmo documento.
    window.addEventListener('storage', sync);
    window.addEventListener(EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(EVENT, sync);
    };
  }, []);

  const update = useCallback((next: boolean) => {
    try {
      localStorage.setItem(KEY, String(next));
    } catch {
      // Quota/modo privado: mantém só em memória.
    }
    window.dispatchEvent(new Event(EVENT));
    setMarkOnOpen(next);
  }, []);

  return [markOnOpen, update] as const;
}
