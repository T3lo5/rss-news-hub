import { useCallback, useState } from 'react';
import { api } from '../services/api';

export function useTelegram() {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const send = useCallback(async (text: string) => {
    setSending(true);
    setError(null);
    setSuccess(false);
    try {
      await api.sendToTelegram(text);
      setSuccess(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao enviar para Telegram';
      setError(msg);
      throw e;
    } finally {
      setSending(false);
    }
  }, []);

  const reset = useCallback(() => {
    setError(null);
    setSuccess(false);
  }, []);

  return { sending, error, success, send, reset };
}
