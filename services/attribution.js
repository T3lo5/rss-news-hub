// Toda peça gerada sai com a fonte original: um post sem o link da notícia é
// impossível de atribuir. O rodapé é anexado só quando o modelo deixou o link
// de fora — se o link já está no texto, o conteúdo passa intacto.
//
// O link sai em formato markdown ([url](url)) de propósito: o mesmo texto vira
// <a> no Telegram (services/markdown.js#markdownToTelegramHtml) e no e-mail
// (services/markdown.js#markdownToHtml), então a fonte fica clicável nos dois.

export function sourceLabels(language) {
  return language === 'en' ? { one: 'Source', many: 'Sources' } : { one: 'Fonte', many: 'Fontes' };
}

export function ensureSourceAttribution(content, items, labels = sourceLabels('pt')) {
  const base = typeof content === 'string' ? content.trimEnd() : '';
  const list = (Array.isArray(items) ? items : [items]).filter(Boolean);
  const missing = list.filter((item) => item.link && !base.includes(item.link));
  if (missing.length === 0) return content;

  const md = (link) => `[${link}](${link})`;
  const line = (item, who) => `${who ? `${who} — ` : ''}${md(item.link)}`;

  const block =
    missing.length === 1
      ? `${labels.one}: ${line(missing[0], missing[0].source || missing[0].title)}`
      : `${labels.many}:\n${missing.map((item) => `• ${line(item, item.title || item.source)}`).join('\n')}`;

  return `${base}${base ? '\n\n' : ''}${block}`;
}
