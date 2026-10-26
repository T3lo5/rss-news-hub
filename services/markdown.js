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
