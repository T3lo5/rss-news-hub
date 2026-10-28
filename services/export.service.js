import { newsRepository } from '../src/db/repositories/index.js';

/**
 * Escape only what actually breaks the generated Markdown: backslashes and
 * the brackets that delimit the link syntax. Escaping every "punctuation"
 * character (as many helpers do) would mangle titles into `2025\-10\-28`.
 */
function escapeMarkdown(text) {
  if (!text) return '';
  return text.replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

/**
 * Clean HTML from description for Markdown export: strip tags and decode the
 * most common entities. `&amp;` is decoded last so double-escaped content
 * (e.g. `&amp;lt;`) does not turn into a raw `<`.
 */
function cleanDescriptionForMarkdown(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, '') // Remove HTML tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

/**
 * Format date for display
 */
function formatDisplayDate(iso) {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/**
 * Export selected news items as Markdown
 */
export function exportMarkdown(items) {
  const date = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  let md = `# Seleção RSS News Hub - ${date}\n\n`;

  for (const item of items) {
    const title = escapeMarkdown(item.title || 'Sem título');
    const link = item.link || '';
    const source = escapeMarkdown(item.source || 'Desconhecida');
    const description = escapeMarkdown(cleanDescriptionForMarkdown(item.description));
    const pubDate = formatDisplayDate(item.pubDate);
    const relevance =
      item.relevanceScore !== null && item.relevanceScore !== undefined
        ? ` (Relevância: ${item.relevanceScore}/100)`
        : '';

    md += `## [${title}](${link}) — ${source}${relevance}\n`;
    md += `*${pubDate}*\n\n`;
    if (description) {
      md += `> ${description}\n\n`;
    }
    md += '---\n\n';
  }

  return md.trim();
}

/**
 * Export selected news items as JSON (full round-trip)
 */
export function exportJSON(items) {
  const exportData = {
    exportedAt: new Date().toISOString(),
    count: items.length,
    items: items.map((item) => ({
      id: item.id,
      title: item.title,
      link: item.link,
      source: item.source,
      description: item.description,
      content: item.content,
      pubDate: item.pubDate,
      relevanceScore: item.relevanceScore,
      feedId: item.feedId,
      readAt: item.readAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Escape XML special characters
 */
function escapeXML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Export selected news items as OPML
 * Uses each item as an RSS outline item
 */
export function exportOPML(items) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<opml version="2.0">\n';
  xml += '  <head>\n';
  xml += `    <title>RSS News Hub Selection - ${new Date().toISOString().split('T')[0]}</title>\n`;
  xml += `    <dateCreated>${new Date().toUTCString()}</dateCreated>\n`;
  xml += '    <ownerName>RSS News Hub</ownerName>\n';
  xml += '  </head>\n';
  xml += '  <body>\n';
  xml += '    <outline text="Seleção Exportada" title="Seleção Exportada">\n';

  for (const item of items) {
    const title = escapeXML(item.title || 'Sem título');
    const link = escapeXML(item.link || '');
    const source = escapeXML(item.source || 'Desconhecida');
    const pubDate = item.pubDate ? new Date(item.pubDate).toUTCString() : new Date().toUTCString();

    xml += `      <outline type="rss" text="${title}" title="${title}" `;
    xml += `xmlUrl="${link}" htmlUrl="${link}" `;
    xml += `description="${escapeXML(`${source} • ${pubDate}`)}" />\n`;
  }

  xml += '    </outline>\n';
  xml += '  </body>\n';
  xml += '</opml>\n';

  return xml;
}

/**
 * Fetch news items by IDs
 */
export async function getNewsByIds(ids) {
  if (!ids.length) return [];
  return newsRepository.findByIds(ids);
}

/**
 * Generate filename with date
 */
export function generateFilename(format, prefix = 'rss-news-selection') {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const ext = format === 'json' ? 'json' : format === 'opml' ? 'opml' : 'md';
  return `${prefix}-${date}.${ext}`;
}

/**
 * Get MIME type for format
 */
export function getMimeType(format) {
  switch (format) {
    case 'json':
      return 'application/json; charset=utf-8';
    case 'opml':
      return 'application/xml; charset=utf-8';
    case 'md':
    default:
      return 'text/markdown; charset=utf-8';
  }
}
