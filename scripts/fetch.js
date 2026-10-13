#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
// Manual RSS fetcher - saves news to data/news.json
import { DATA_DIR, NEWS_FILE, RSS_FEEDS } from '../server.config.js';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchFeed(feed) {
  const res = await fetch(feed.url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${feed.name}`);
  return await res.text();
}

function parseRSS(xml, sourceName) {
  const items = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  const entryRegex = /<entry[^>]*>([\s\S]*?)<\/entry>/gi;

  let match;
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

function extractTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = xml.match(re);
  if (!m) return '';
  let content = m[1].trim();
  // Remove CDATA wrapper if present
  content = content.replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, '$1');
  return content;
}

function extractAttr(xml, tag, attr) {
  const re = new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["'][^>]*>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : '';
}

function stripHtml(html) {
  return html
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gs, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/&/g, '&')
    .replace(/"/g, '"')
    .replace(/'/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(str) {
  return str
    .replace(/&#8216;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8230;/g, '...')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#38;/g, '&')
    .replace(/&#60;/g, '<')
    .replace(/&#62;/g, '>')
    .replace(/&#34;/g, '"')
    .replace(/'/g, "'")
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&hellip;/g, '...')
    .replace(/&lsquo;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => {
      const num = parseInt(code, 10);
      return num >= 0 && num <= 0x10ffff ? String.fromCodePoint(num) : '';
    })
    .replace(/&(#x[0-9a-fA-F]+);/g, (_, code) => {
      const num = parseInt(code.slice(1), 16);
      return num >= 0 && num <= 0x10ffff ? String.fromCodePoint(num) : '';
    });
}

async function main() {
  console.log(`Fetching ${RSS_FEEDS.length} feeds...`);
  const allNews = [];

  for (const feed of RSS_FEEDS) {
    try {
      const xml = await fetchFeed(feed);
      const items = parseRSS(xml, feed.name);
      console.log(`  ✓ ${feed.name}: ${items.length} items`);
      allNews.push(...items);
    } catch (err) {
      console.error(`  ✗ ${feed.name}: ${err.message}`);
    }
  }

  // Deduplicate by id
  const seen = new Set();
  const unique = allNews.filter((n) => {
    if (seen.has(n.id)) return false;
    seen.add(n.id);
    return true;
  });

  // Sort newest first
  unique.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(NEWS_FILE, JSON.stringify(unique, null, 2), 'utf-8');

  console.log(`\nSaved ${unique.length} unique news items to data/news.json`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
