// Minimal markdown -> inline-styled HTML conversion used for email bodies and
// Telegram HTML messages. Kept dependency-free on purpose (the app avoids a
// full markdown pipeline elsewhere too — RSS parsing is regex based).
// Item de lista da conversão abaixo — compilado no módulo, não por mensagem.
const LIST_ITEM_LINE = /^- (.+)$/gm;

export function markdownToHtml(md) {
  return md
    .replace(/^# (.+)$/gm, '<h1 style="color:#1a1a2e;margin:24px 0 12px;font-size:24px;">$1</h1>')
    .replace(/^## (.+)$/gm, '<h2 style="color:#1a1a2e;margin:20px 0 10px;font-size:20px;">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 style="color:#1a1a2e;margin:16px 0 8px;font-size:18px;">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(
      /`(.+?)`/g,
      '<code style="background:#f0f0f0;padding:2px 4px;border-radius:3px;">$1</code>'
    )
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" style="color:#2563eb;">$1</a>')
    .replace(LIST_ITEM_LINE, '<li style="margin:8px 0;">$1</li>')
    .replace(/(<li.*>.*<\/li>)/s, '<ul style="margin:12px 0;padding-left:20px;">$1</ul>')
    .replace(/\n\n/g, '</p><p style="margin:12px 0;line-height:1.6;">')
    .replace(/^(.+)$/gm, '<p style="margin:12px 0;line-height:1.6;">$1</p>')
    .replace(/<p style="margin:12px 0;line-height:1.6;"><\/p>/g, '')
    .replace(/<p style="margin:12px 0;line-height:1.6;">(<h[1-3].*<\/h[1-3]>)<\/p>/g, '$1')
    .replace(/<p style="margin:12px 0;line-height:1.6;">(<ul.*<\/ul>)<\/p>/g, '$1');
}

// Markdown -> Telegram HTML. Telegram's HTML mode has no headings and no
// lists, so those map to the closest thing it does render; everything else
// (bold, italic, code, links) is native. Plain text passes through escaped,
// which also fixes messages that previously broke on a stray `<` or `&`.
// The whole string is escaped up front, then only our own tags are inserted,
// so no input can smuggle markup past the parser.
// Regexes do conversor para o Telegram, compiladas no módulo (não por mensagem).
// Os flags `g` são seguros aqui: só entram em `.replace`, que zera o lastIndex.
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

export function markdownToTelegramHtml(md) {
  if (typeof md !== 'string' || md === '') return '';

  // 1. Escape what Telegram's HTML parser would read as markup.
  let text = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // 2. Park fenced blocks and inline code so their content is never rewritten
  //    by the rules below (`**x**` inside a snippet must stay literal).
  const fences = [];
  const spans = [];
  text = text
    .replace(TG_FENCE, (_m, raw) => {
      let code = raw;
      // Drop the optional language tag / leading newline after the opening fence.
      if (TG_FENCE_LANG.test(code)) code = code.slice(code.indexOf('\n') + 1);
      else if (code.startsWith('\n')) code = code.slice(1);
      fences.push(code.replace(TG_TRAILING_NEWLINE, ''));
      return `\u0000${fences.length - 1}\u0000`;
    })
    .replace(TG_CODE_SPAN, (_m, code) => {
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
    .replace(TG_LINK, (_m, label, url) =>
      TG_HTTP_URL.test(url) ? `<a href="${url.replace(TG_DQUOTE, '&quot;')}">${label}</a>` : label
    );

  // 5. Put the parked code back.
  return text
    .replace(TG_FENCE_SLOT, (_m, i) => `<pre>${fences[Number(i)]}</pre>`)
    .replace(TG_SPAN_SLOT, (_m, i) => `<code>${spans[Number(i)]}</code>`);
}

// Wrap generated content in a complete, readable email document.
export function renderEmailHtml(body) {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f4f4f5;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:8px;padding:28px;color:#1a1a2e;font-size:15px;">
      ${markdownToHtml(body)}
    </div>
  </body>
</html>`;
}
