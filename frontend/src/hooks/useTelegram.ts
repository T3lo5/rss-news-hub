import { useCallback, useState } from 'react';
import { useI18n } from '../i18n';
import { api } from '../services/api';

export function useTelegram() {
  const { t } = useI18n();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const send = useCallback(
    async (text: string) => {
      setSending(true);
      setError(null);
      setSuccess(false);
      try {
        await api.sendToTelegram(text);
        setSuccess(true);
      } catch (e) {
        // A restricted account has no bot of its own and may not borrow one.
        const code = (e as { code?: string } | null)?.code;
        const fallback = e instanceof Error ? e.message : 'Erro ao enviar para Telegram';
        setError(code === 'TELEGRAM_REQUIRED' ? t('telegram.botRequired') : fallback);
        throw e;
      } finally {
        setSending(false);
      }
    },
    [t]
  );

  const reset = useCallback(() => {
    setError(null);
    setSuccess(false);
  }, []);

  return { sending, error, success, send, reset };
}
