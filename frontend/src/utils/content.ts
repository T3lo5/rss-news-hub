import type { ContentType } from '../types';

// RSS descriptions are frequently HTML (often entity-escaped). Render them as
// plain text: decode entities, drop tags, collapse whitespace.
export function cleanDescription(input?: string): string {
  if (!input) return '';

  const decodeAndStrip = (value: string): string =>
    value
      .replace(/&nbsp;/gi, ' ')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#0*39;/g, "'")
      .replace(/&#x27;/gi, "'")
      .replace(/&apos;/gi, "'")
      .replace(/&amp;/gi, '&')
      .replace(/<[^>]*>/g, ' ')
      // Drop an unterminated tag (feeds sometimes truncate mid-tag).
      .replace(/<[^>]*$/, ' ');
  // Run twice so double-escaped markup (e.g. "&amp;lt;p&amp;gt;") is fully decoded.
  const text = decodeAndStrip(decodeAndStrip(String(input)));
  return text.replace(/\s+/g, ' ').trim();
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

// Mirrors services/ai.service.js#stripEditorialMeta. Some models still emit the
// editorial analysis sections even when instructed not to; strip them so the
// displayed, copied, and Telegram-sent text contains only the post.
export function stripEditorialMeta(content: string): string {
  if (!content || typeof content !== 'string') return content || '';

  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const isSep = (l: string) => /^\s*-{3,}\s*$/.test(l);
  const isEnd = (l: string) => /(Por que pode funcionar|Pontos a confirmar)/i.test(l);
  const stripLabel = (line: string) =>
    line
      .replace(/^\s*#{1,6}\s*/, '')
      .replace(/\*\*/g, '')
      .replace(/^\s*(Ângulo escolhido|Post final)\s*:?\s*/i, '')
      .trim();

  const postFinalIdx = lines.findIndex((l) => /Post final/i.test(l));
  const angleIdx = lines.findIndex((l) => /Ângulo escolhido/i.test(l));

  let start = 0;
  let inlinePrefix = '';
  if (postFinalIdx !== -1) {
    inlinePrefix = stripLabel(lines[postFinalIdx]);
    start = postFinalIdx + 1;
  } else if (angleIdx !== -1) {
    let sepIdx = -1;
    for (let i = angleIdx + 1; i < lines.length; i++) {
      if (isSep(lines[i])) {
        sepIdx = i;
        break;
      }
      if (isEnd(lines[i])) break;
    }
    start = sepIdx !== -1 ? sepIdx + 1 : angleIdx + 1;
  }

  const endIdx = lines.findIndex((l, i) => i >= start && isEnd(l));
  const end = endIdx !== -1 ? endIdx : lines.length;

  const result = lines.slice(start, end);
  while (result.length && (isSep(result[0]) || result[0].trim() === '')) result.shift();
  while (
    result.length &&
    (isSep(result[result.length - 1]) || result[result.length - 1].trim() === '')
  ) {
    result.pop();
  }

  let cleaned = result.join('\n').trim();
  if (inlinePrefix) cleaned = `${inlinePrefix}\n\n${cleaned}`.trim();
  return cleaned || content.trim();
}

// Convert generated content into the text that will be stored, displayed, or
// sent to Telegram. Threads are JSON and get flattened into readable text.
export function formatGeneratedContent(content: string, type: ContentType): string {
  if (!content) return '';
  if (type === 'linkedin') return stripEditorialMeta(content);
  if (type === 'thread') {
    try {
      const parsed = JSON.parse(content);
      if (parsed.tweets && Array.isArray(parsed.tweets)) {
        return parsed.tweets.join('\n\n') + (parsed.link ? `\n\n🔗 ${parsed.link}` : '');
      }
    } catch {
      // If parsing fails, return as-is
    }
  }
  return content;
}
