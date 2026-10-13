/**
 * Built-in Fetcher Plugins - RSS/Atom feed fetching
 */

import {
  type FeedConfig,
  type FetcherPlugin,
  ParsedFeedItem,
  PluginConfig,
  type PluginManifest,
  type RawFeedItem,
} from '../types.js';

export class RSSFetcherPlugin implements FetcherPlugin {
  manifest: PluginManifest & { type: 'fetcher' } = {
    name: 'rss-fetcher',
    version: '1.0.0',
    type: 'fetcher',
    description: 'Standard RSS/Atom feed fetcher with ETag/Last-Modified support',
    author: 'RSS News Hub Team',
    license: 'MIT',
    main: 'rss-fetcher.js',
    configSchema: {
      type: 'object',
      properties: {
        timeout: { type: 'integer', minimum: 1000, maximum: 120000, default: 15000 },
        userAgent: {
          type: 'string',
          default: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        maxItemsPerFeed: { type: 'integer', minimum: 1, maximum: 100, default: 5 },
      },
    },
  };

  config: any = {
    enabled: true,
    config: {
      timeout: 15000,
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      maxItemsPerFeed: 5,
    },
  };

  async init(config: any): Promise<void> {
    this.config = config;
  }

  async fetch(feed: FeedConfig): Promise<RawFeedItem[]> {
    const url = feed.url;
    const options = this.config.config;

    const headers: Record<string, string> = {
      'User-Agent': options.userAgent,
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
    };

    // ETag/Last-Modified would be handled by the cache layer
    // This fetcher just does the raw HTTP request

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout);

    try {
      const response = await fetch(url, {
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 304) {
        return [];
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${feed.name}`);
      }

      const xml = await response.text();
      return this.parse(xml, feed.name);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  parse(xml: string, sourceName: string): RawFeedItem[] {
    const items: RawFeedItem[] = [];
    const maxItems = this.config.config.maxItemsPerFeed;

    // RSS 2.0 items
    const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
    let match;
    let count = 0;

    while ((match = itemRegex.exec(xml)) !== null && count < maxItems) {
      const raw = match[1];
      const item = this.parseItem(raw, sourceName);
      if (item) {
        items.push(item);
        count++;
      }
    }

    // Atom entries fallback
    if (items.length === 0) {
      const entryRegex = /<entry[^>]*>([\s\S]*?)<\/entry>/gi;
      while ((match = entryRegex.exec(xml)) !== null && count < maxItems) {
        const raw = match[1];
        const item = this.parseAtomEntry(raw, sourceName);
        if (item) {
          items.push(item);
          count++;
        }
      }
    }

    return items;
  }

  private parseItem(raw: string, sourceName: string): RawFeedItem | null {
    const title = this.extractTag(raw, 'title');
    const link = this.extractAttr(raw, 'link', 'href') || this.extractTag(raw, 'link');
    const guid = this.extractTag(raw, 'guid') || this.extractAttr(raw, 'guid', 'guid') || link;
    const pubDate = this.extractTag(raw, 'pubDate') || this.extractTag(raw, 'published');
    const description = this.extractTag(raw, 'description') || this.extractTag(raw, 'summary');
    const content =
      this.extractTag(raw, 'content:encoded') || this.extractTag(raw, 'description') || '';

    if (!title || !link) return null;

    return {
      id: guid || link,
      title: this.decodeEntities(title),
      link: link.trim(),
      source: sourceName,
      pubDate: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      description: this.decodeEntities(this.stripHtml(description || title)).slice(0, 500),
      content: this.decodeEntities(this.stripHtml(content || description || title)).slice(0, 2000),
    };
  }

  private parseAtomEntry(raw: string, sourceName: string): RawFeedItem | null {
    const title = this.extractTag(raw, 'title');
    const link = this.extractAttr(raw, 'link', 'href') || this.extractTag(raw, 'link');
    const id = this.extractTag(raw, 'id') || link;
    const published = this.extractTag(raw, 'published') || this.extractTag(raw, 'updated');
    const summary = this.extractTag(raw, 'summary') || this.extractTag(raw, 'content');

    if (!title || !link) return null;

    return {
      id: id || link,
      title: this.decodeEntities(title),
      link: link.trim(),
      source: sourceName,
      pubDate: published ? new Date(published).toISOString() : new Date().toISOString(),
      description: this.decodeEntities(this.stripHtml(summary || title)).slice(0, 500),
      content: this.decodeEntities(this.stripHtml(summary || title)).slice(0, 2000),
    };
  }

  private extractTag(xml: string, tag: string): string {
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const m = xml.match(re);
    if (!m) return '';
    let content = m[1].trim();
    content = content.replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, '$1');
    return content;
  }

  private extractAttr(xml: string, tag: string, attr: string): string {
    const re = new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["'][^>]*>`, 'i');
    const m = xml.match(re);
    return m ? m[1].trim() : '';
  }

  private stripHtml(html: string): string {
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

  private decodeEntities(str: string): string {
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
      .replace(/&#x([0-9a-fA-F]+);/gi, (_, code) => {
        const num = parseInt(code, 16);
        return num >= 0 && num <= 0x10ffff ? String.fromCodePoint(num) : '';
      });
  }

  async shutdown(): Promise<void> {
    // No cleanup needed
  }

  validateConfig(config: unknown): boolean {
    if (!config || typeof config !== 'object') return false;
    return true;
  }
}
