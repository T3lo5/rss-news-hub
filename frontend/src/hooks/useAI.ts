import { useCallback, useState } from 'react';
import { api } from '../services/api';
import type { NewsItem } from '../types';

export type ContentType = 'thread' | 'summary' | 'linkedin' | 'blog' | 'newsletter';
export type Language = 'en' | 'pt';
export type Provider = 'auto' | 'sensenova' | 'deepseek' | 'openai';

export function useAI() {
  const [generatedContent, setGeneratedContent] = useState<string>('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(
    async (
      news: NewsItem | NewsItem[],
      type: ContentType,
      language: Language,
      provider: Provider = 'auto',
      templateId?: string,
      templateVariables?: Record<string, string>
    ) => {
      setGenerating(true);
      setError(null);
      setGeneratedContent('');
      try {
        const content = await api.generateContent({
          news,
          type,
          language,
          provider,
          templateId,
          templateVariables,
        });
        setGeneratedContent(content);
        return content;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Erro ao gerar conteúdo';
        setError(msg);
        throw e;
      } finally {
        setGenerating(false);
      }
    },
    []
  );

  const clear = useCallback(() => {
    setGeneratedContent('');
    setError(null);
  }, []);

  // Restore previously generated content (e.g. reopening a news item that
  // already has a saved post) without calling the API again.
  const setContent = useCallback((content: string) => {
    setGeneratedContent(content || '');
    setError(null);
  }, []);

  return { generatedContent, generating, error, generate, clear, setContent };
}
