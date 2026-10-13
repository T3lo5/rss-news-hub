import { RSS_FEEDS } from '../server.config.js';
import {
  feedCacheRepository,
  feedRepository,
  newsHashRepository,
  newsRepository,
} from '../src/db/repositories/index.js';
import { linkHash } from './deduplication.js';
import { recordFeedResult, recordFetchResult, recordFetchStart } from './stats.service.js';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchFeed(feed, options = {}) {
  const { bypassCache = false } = options;
  const feedName = feed.name || feed;
  const url = feed.url || feed;

  const cached = await feedCacheRepository.get(feed.id);
  const headers = {
    'User-Agent': USER_AGENT,
    Accept: 'application/rss+xml, application/xml, text/xml, */*',
  };
  if (!bypassCache && cached) {
    if (cached.etag) headers['If-None-Match'] = cached.etag;
    if (cached.lastModified) headers['If-Modified-Since'] = cached.lastModified;
  }

  const res = await fetch(url, { headers });

  if (res.status === 304) {
    return '';
  }

  if (!res.ok) throw new Error(`HTTP ${res.status} for ${feedName}`);

  const etag = res.headers.get('etag');
  const lastModified = res.headers.get('last-modified');

  if (etag || lastModified) {
    await feedCacheRepository.set(feed.id, etag, lastModified);
  }

  return await res.text();
}

async function fetchFeedByUrl(url, options = {}) {
  const feedName = `test-${new URL(url).hostname}`;
  return fetchFeed({ name: feedName, url, id: feedName }, options);
}

function extractTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = xml.match(re);
  if (!m) return '';
  let content = m[1].trim();
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

async function fetchAllFeeds() {
  recordFetchStart();

  // Load hash index for deduplication
  await newsHashRepository.loadHashIndex();

  const allNews = [];
  const results = [];
  let totalItems = 0;
  let totalErrors = 0;

  // Read existing news to track duplicates
  const existingNews = await newsRepository.findAll();
  const existingIds = new Set(existingNews.map((n) => n.id));

  for (const feed of RSS_FEEDS) {
    const feedStartTime = Date.now();
    try {
      const xml = await fetchFeed(feed);
      const latencyMs = Date.now() - feedStartTime;
      const items = parseRSS(xml, feed.name);
      const is304 = xml === '';

      // Track new vs duplicate items using hash index
      let itemsNew = 0;
      let itemsDuplicate = 0;
      let itemsSkipped = 0;
      const filteredItems = [];

      for (const item of items) {
        const hash = linkHash(item.link);

        // Check both existing news IDs and hash index
        if (existingIds.has(item.id) || (await newsHashRepository.exists(hash))) {
          itemsDuplicate++;
          itemsSkipped++;
        } else {
          itemsNew++;
          existingIds.add(item.id);
          await newsHashRepository.add(hash, item.id);
          filteredItems.push(item);
        }
      }

      results.push({ source: feed.name, count: filteredItems.length, error: null });
      allNews.push(...filteredItems);
      totalItems += filteredItems.length;
      recordFeedResult(feed.name, {
        success: true,
        items: filteredItems.length,
        itemsNew,
        itemsDuplicate,
        etagHit: is304,
        latencyMs,
      });
    } catch (err) {
      const latencyMs = Date.now() - feedStartTime;
      console.error(`Fetch error for ${feed.name}:`, err);
      console.error('Stack:', err.stack);
      results.push({ source: feed.name, count: 0, error: err.message });
      totalErrors++;
      recordFeedResult(feed.name, {
        success: false,
        error: err.message,
        latencyMs,
      });
    }
  }

  // Save all new items to database
  if (allNews.length > 0) {
    const newsItems = allNews.map((item) => ({
      id: item.id,
      title: item.title,
      link: item.link,
      source: item.source,
      pubDate: new Date(item.pubDate),
      description: item.description,
      content: item.content,
      relevanceScore: 0,
      feedId: item.source, // Map source to feed ID
    }));

    await newsRepository.upsertMany(newsItems);
  }

  recordFetchResult({ total: totalItems, errors: totalErrors });

  return { total: allNews.length, results };
}

export { fetchAllFeeds, fetchFeed, fetchFeedByUrl, parseRSS };
