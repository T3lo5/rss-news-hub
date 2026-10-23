import { useCallback, useEffect, useState } from 'react';

const KEY = 'reading:openInApp';
const EVENT = 'reading:open-in-app';

/**
 * Preferência por dispositivo: abrir a notícia no leitor interno em vez de
 * sair para o site. Padrão `false` — o comportamento histórico (nova aba) é
 * mantido até o usuário optar pelo leitor.
 */
export function readOpenInReader(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(KEY) === 'true';
  } catch {
    return false;
  }
}

export function useOpenInReader() {
  const [openInReader, setOpenInReaderState] = useState(readOpenInReader);

  useEffect(() => {
    const sync = () => setOpenInReaderState(readOpenInReader());
    // `storage` cobre outra aba; o evento próprio cobre o mesmo documento.
    window.addEventListener('storage', sync);
    window.addEventListener(EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(EVENT, sync);
    };
  }, []);

  const setOpenInReader = useCallback((next: boolean) => {
    try {
      localStorage.setItem(KEY, String(next));
    } catch {
      // Quota/modo privado: mantém só em memória.
    }
    window.dispatchEvent(new Event(EVENT));
    setOpenInReaderState(next);
  }, []);

  return [openInReader, setOpenInReader] as const;
}
