import assert from 'node:assert';
import { describe, test } from 'node:test';

function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : '';
}

function extractAttr(xml: string, tag: string, attr: string): string {
  const re = new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["'][^>]*>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : '';
}

function stripHtml(html: string): string {
  return html
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/<[^>]*>/g, '')
    .trim();
}

function decodeEntities(str: string): string {
  return str
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function parseRSS(xml: string, sourceName: string) {
  const items: any[] = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  const entryRegex = /<entry[^>]*>([\s\S]*?)<\/entry>/gi;

  let match: RegExpExecArray | null;
  let count = 0;

  while ((match = itemRegex.exec(xml)) !== null && count < 5) {
    const raw = match[1];
    const title = extractTag(raw, 'title');
    const link = extractAttr(raw, 'link', 'href') || extractTag(raw, 'link');
    const guid = extractTag(raw, 'guid') || extractAttr(raw, 'guid', 'guid') || link;
    const pubDate = extractTag(raw, 'pubDate') || extractTag(raw, 'published');
    const description = extractTag(raw, 'description') || extractTag(raw, 'summary');
    const content = extractTag(raw, 'content:encoded') || extractTag(raw, 'description') || '';

    if (title && link) {
      items.push({
        id: guid || link,
        title: decodeEntities(title),
        link: link.trim(),
        source: sourceName,
        pubDate: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        description: decodeEntities(stripHtml(description || title)).slice(0, 500),
        content: decodeEntities(stripHtml(content || description || title)).slice(0, 2000),
      });
    }
    count++;
  }

  // Atom fallback
  while ((match = entryRegex.exec(xml)) !== null && count < 5) {
    const raw = match[1];
    const title = extractTag(raw, 'title');
    const link = extractAttr(raw, 'link', 'href') || extractTag(raw, 'link');
    const id = extractTag(raw, 'id') || link;
    const published = extractTag(raw, 'published') || extractTag(raw, 'updated');
    const summary = extractTag(raw, 'summary') || extractTag(raw, 'content');

    if (title && link) {
      items.push({
        id: id || link,
        title: decodeEntities(title),
        link: link.trim(),
        source: sourceName,
        pubDate: published ? new Date(published).toISOString() : new Date().toISOString(),
        description: decodeEntities(stripHtml(summary || title)).slice(0, 500),
        content: decodeEntities(stripHtml(summary || title)).slice(0, 2000),
      });
    }
    count++;
  }

  return items;
}

describe('fetch - RSS parsing', () => {
  describe('extractTag', () => {
    test('extracts simple tag content', () => {
      const xml = '<title>Test Title</title>';
      assert.strictEqual(extractTag(xml, 'title'), 'Test Title');
    });

    test('extracts tag with attributes', () => {
      const xml = '<title type="text">Test Title</title>';
      assert.strictEqual(extractTag(xml, 'title'), 'Test Title');
    });

    test('returns empty string for missing tag', () => {
      const xml = '<other>Content</other>';
      assert.strictEqual(extractTag(xml, 'title'), '');
    });

    test('handles multiline content', () => {
      const xml = '<description>\n  Line 1\n  Line 2\n</description>';
      assert.strictEqual(extractTag(xml, 'description'), 'Line 1\n  Line 2');
    });

    test('is case insensitive', () => {
      const xml = '<TITLE>Test</TITLE>';
      assert.strictEqual(extractTag(xml, 'title'), 'Test');
    });
  });

  describe('extractAttr', () => {
    test('extracts href attribute from link tag', () => {
      const xml = '<link href="https://example.com/article" />';
      assert.strictEqual(extractAttr(xml, 'link', 'href'), 'https://example.com/article');
    });

    test('extracts guid attribute', () => {
      const xml = '<guid guid="12345">content</guid>';
      assert.strictEqual(extractAttr(xml, 'guid', 'guid'), '12345');
    });

    test('returns empty string for missing attribute', () => {
      const xml = '<link>https://example.com</link>';
      assert.strictEqual(extractAttr(xml, 'link', 'href'), '');
    });
  });

  describe('stripHtml', () => {
    test('removes HTML tags', () => {
      const html = '<p>Hello <b>World</b></p>';
      assert.strictEqual(stripHtml(html), 'Hello World');
    });

    test('handles CDATA sections', () => {
      const html = '<content><![CDATA[<p>Raw HTML</p>]]></content>';
      assert.strictEqual(stripHtml(html), 'Raw HTML');
    });

    test('trims whitespace', () => {
      const html = '  <p>Content</p>  ';
      assert.strictEqual(stripHtml(html), 'Content');
    });
  });

  describe('decodeEntities', () => {
    test('decodes common HTML entities', () => {
      const str = `< > " ' &nbsp;`;
      assert.strictEqual(decodeEntities(str), `< > " '  `);
    });

    test('leaves text without entities unchanged', () => {
      const str = 'Plain text';
      assert.strictEqual(decodeEntities(str), 'Plain text');
    });
  });

  describe('parseRSS', () => {
    test('parses standard RSS feed', () => {
      const rss = `<?xml version="1.0"?>
        <rss version="2.0">
          <channel>
            <item>
              <title>Article 1</title>
              <link>https://example.com/1</link>
              <guid>1</guid>
              <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
              <description>Description 1</description>
              <content:encoded><![CDATA[<p>Full content 1</p>]]></content:encoded>
            </item>
            <item>
              <title>Article 2</title>
              <link>https://example.com/2</link>
              <description>Description 2</description>
            </item>
          </channel>
        </rss>`;

      const items = parseRSS(rss, 'Test Source');
      assert.strictEqual(items.length, 2);
      assert.strictEqual(items[0].title, 'Article 1');
      assert.strictEqual(items[0].link, 'https://example.com/1');
      assert.strictEqual(items[0].source, 'Test Source');
      assert.ok(items[0].pubDate.includes('2024'));
      assert.strictEqual(items[0].description, 'Description 1');
      assert.ok(items[0].content.includes('Full content 1'));
    });

    test('parses Atom feed', () => {
      const atom = `<?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <title>Atom Article</title>
            <link href="https://example.com/atom" />
            <id>atom-1</id>
            <published>2024-01-01T00:00:00Z</published>
            <summary>Atom summary</summary>
          </entry>
        </feed>`;

      const items = parseRSS(atom, 'Atom Source');
      assert.strictEqual(items.length, 1);
      assert.strictEqual(items[0].title, 'Atom Article');
      assert.strictEqual(items[0].link, 'https://example.com/atom');
      assert.strictEqual(items[0].source, 'Atom Source');
      assert.strictEqual(items[0].id, 'atom-1');
    });

    test('limits to 5 items per feed', () => {
      let rss = '<?xml version="1.0"?><rss version="2.0"><channel>';
      for (let i = 1; i <= 10; i++) {
        rss += `<item><title>Article ${i}</title><link>https://example.com/${i}</link></item>`;
      }
      rss += '</channel></rss>';

      const items = parseRSS(rss, 'Test');
      assert.strictEqual(items.length, 5);
    });

    test('handles missing optional fields', () => {
      const rss = `<?xml version="1.0"?>
        <rss version="2.0">
          <channel>
            <item>
              <title>Minimal Article</title>
              <link>https://example.com/minimal</link>
            </item>
          </channel>
        </rss>`;

      const items = parseRSS(rss, 'Test');
      assert.strictEqual(items.length, 1);
      assert.strictEqual(items[0].title, 'Minimal Article');
      assert.ok(items[0].pubDate); // Should have a default date
      assert.strictEqual(items[0].description, 'Minimal Article'); // Falls back to title
    });

    test('skips items without title or link', () => {
      const rss = `<?xml version="1.0"?>
        <rss version="2.0">
          <channel>
            <item>
              <title>Valid Article</title>
              <link>https://example.com/valid</link>
            </item>
            <item>
              <title>No Link</title>
            </item>
            <item>
              <link>https://example.com/no-title</link>
            </item>
          </channel>
        </rss>`;

      const items = parseRSS(rss, 'Test');
      assert.strictEqual(items.length, 1);
      assert.strictEqual(items[0].title, 'Valid Article');
    });

    test('decodes HTML entities in title and content', () => {
      const rss = `<?xml version="1.0"?>
        <rss version="2.0">
          <channel>
            <item>
              <title>Title with & entity</title>
              <link>https://example.com/entity</link>
              <description>Description with <tag></description>
            </item>
          </channel>
        </rss>`;

      const items = parseRSS(rss, 'Test');
      assert.strictEqual(items[0].title, 'Title with & entity');
      assert.strictEqual(items[0].description, 'Description with');
    });
  });
});
