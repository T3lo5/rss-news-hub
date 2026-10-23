import { useEffect, useState } from 'react';

/**
 * Atrasa a propagação de um valor. Usado na busca: o input responde na hora,
 * mas a requisição ao servidor só sai quando o usuário para de digitar.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
