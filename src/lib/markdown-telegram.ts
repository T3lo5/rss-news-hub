/**
 * Markdown → Telegram HTML.
 *
 * Telegram's HTML mode has no headings and no lists, so those map to the
 * closest thing it does render; everything else (bold, italic, code, links) is
 * native. Plain text passes through escaped, which also fixes messages that
 * previously broke on a stray `<` or `&`.
 *
 * The whole string is escaped up front, then only our own tags are inserted,
 * so no input can smuggle markup past the parser.
 *
 * Vive na camada TS para que os plugins (também TS) o usem sem importar JS sem
 * tipos; `services/markdown.js` reexporta para manter a API pública dos serviços.
 */

// Compiladas no módulo, não por mensagem. Os flags `g` são seguros: só entram
// em `.replace`, que zera o lastIndex antes e depois.
const TG_FENCE = /```([\s\S]*?)```/g;
const TG_FENCE_LANG = /^[A-Za-z0-9_+-]+\n/;
const TG_CODE_SPAN = /`([^`\n]+)`/g;
const TG_HEADING = /^#{1,6}[ \t]+(.+)$/gm;
const TG_BULLET = /^[ \t]*[-*][ \t]+(.+)$/gm;
const TG_BOLD = /\*\*([^*]+)\*\*/g;
const TG_ITALIC = /\*(?!\s)([^*\n]+?)(?<!\s)\*/g;
const TG_UNDERSCORE = /(?<![A-Za-z0-9])_(?!\s)([^_\n]+?)(?<!\s)_(?![A-Za-z0-9])/g;
const TG_LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
const TG_HTTP_URL = /^https?:\/\//i;
const TG_TRAILING_NEWLINE = /\n$/;
const TG_DQUOTE = /"/g;
const TG_FENCE_SLOT = /\u0000(\d+)\u0000/g;
const TG_SPAN_SLOT = /\u0001(\d+)\u0001/g;

export function markdownToTelegramHtml(md: string): string {
  if (typeof md !== 'string' || md === '') return '';

  // 1. Escape what Telegram's HTML parser would read as markup. `&` goes first
  //    so the entities introduced here are not escaped a second time.
  let text = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // 2. Park fenced blocks and inline code so their content is never rewritten
  //    by the rules below (`**x**` inside a snippet must stay literal).
  const fences: string[] = [];
  const spans: string[] = [];
  text = text
    .replace(TG_FENCE, (_m: string, raw: string) => {
      let code = raw;
      // Drop the optional language tag / leading newline after the opening fence.
      if (TG_FENCE_LANG.test(code)) code = code.slice(code.indexOf('\n') + 1);
      else if (code.startsWith('\n')) code = code.slice(1);
      fences.push(code.replace(TG_TRAILING_NEWLINE, ''));
      return `\u0000${fences.length - 1}\u0000`;
    })
    .replace(TG_CODE_SPAN, (_m: string, code: string) => {
      spans.push(code);
      return `\u0001${spans.length - 1}\u0001`;
    });

  // 3. Block level: headings become a bold line, bullets become `• `.
  text = text.replace(TG_HEADING, '<b>$1</b>').replace(TG_BULLET, '• $1');

  // 4. Inline level. Boundaries keep `5 * 3` and snake_case identifiers from
  //    being read as emphasis.
  text = text
    .replace(TG_BOLD, '<b>$1</b>')
    .replace(TG_ITALIC, '<i>$1</i>')
    .replace(TG_UNDERSCORE, '<i>$1</i>')
    .replace(TG_LINK, (_m: string, label: string, url: string) =>
      TG_HTTP_URL.test(url) ? `<a href="${url.replace(TG_DQUOTE, '&quot;')}">${label}</a>` : label
    );

  // 5. Put the parked code back.
  return text
    .replace(TG_FENCE_SLOT, (_m: string, i: string) => `<pre>${fences[Number(i)]}</pre>`)
    .replace(TG_SPAN_SLOT, (_m: string, i: string) => `<code>${spans[Number(i)]}</code>`);
}
