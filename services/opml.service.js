// Config provider function - can be overridden in tests
let configProvider = null;

export function setConfigProvider(provider) {
  configProvider = provider;
}

async function getConfigProvider() {
  if (configProvider) return configProvider;
  const { readFeedsConfig, writeFeedsConfig, generateFeedId, validateFeedUrl } = await import(
    './config.service.js'
  );
  return { readFeedsConfig, writeFeedsConfig, generateFeedId, validateFeedUrl };
}

function parseOPML(xmlString) {
  const outlineRegex = /<outline[^>]*>/g;
  const attrRegex = /(\w+)="([^"]*)"/g;

  const outlines = [];
  let match;

  while ((match = outlineRegex.exec(xmlString)) !== null) {
    const attrs = {};
    let attrMatch;
    while ((attrMatch = attrRegex.exec(match[0])) !== null) {
      attrs[attrMatch[1]] = attrMatch[2];
    }
    outlines.push(attrs);
  }

  return outlines;
}

export function extractFeedsFromOPML(xmlString) {
  const outlines = parseOPML(xmlString);
  const feeds = [];
  let currentCategory = 'Uncategorized';

  for (const outline of outlines) {
    // If this is a category/group outline (has text/title but no xmlUrl and no type=rss)
    if (!(outline.xmlUrl || outline.type) && (outline.text || outline.title)) {
      currentCategory = outline.text || outline.title;
      continue;
    }

    if (outline.type === 'rss' || outline.xmlUrl) {
      feeds.push({
        name: outline.text || outline.title || 'Unknown Feed',
        url: outline.xmlUrl,
        category: currentCategory,
      });
    }
  }

  return feeds;
}

export function generateOPML(feeds) {
  const categoryMap = {};

  for (const feed of feeds) {
    const category = feed.category || 'Uncategorized';
    if (!categoryMap[category]) {
      categoryMap[category] = [];
    }
    categoryMap[category].push(feed);
  }

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<opml version="2.0">\n';
  xml += '  <head>\n';
  xml += `    <title>RSS News Hub Feeds</title>\n`;
  xml += `    <dateCreated>${new Date().toUTCString()}</dateCreated>\n`;
  xml += `    <ownerName>RSS News Hub</ownerName>\n`;
  xml += '  </head>\n';
  xml += '  <body>\n';

  for (const [category, categoryFeeds] of Object.entries(categoryMap)) {
    xml += `    <outline text="${escapeXML(category)}" title="${escapeXML(category)}">\n`;
    for (const feed of categoryFeeds) {
      xml += `      <outline type="rss" text="${escapeXML(feed.name)}" title="${escapeXML(feed.name)}" xmlUrl="${escapeXML(feed.url)}" htmlUrl="${escapeXML(feed.url)}" />\n`;
    }
    xml += '    </outline>\n';
  }

  xml += '  </body>\n';
  xml += '</opml>\n';

  return xml;
}

function escapeXML(str) {
  return str
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&apos;');
}

export async function exportOPML() {
  const { readFeedsConfig } = await getConfigProvider();
  const feeds = await readFeedsConfig();
  return generateOPML(feeds);
}

export async function importOPML(fileBuffer) {
  const xmlString = fileBuffer.toString('utf-8');
  const feeds = extractFeedsFromOPML(xmlString);

  const { readFeedsConfig, writeFeedsConfig, generateFeedId, validateFeedUrl } =
    await getConfigProvider();
  const existingFeeds = await readFeedsConfig();
  const existingUrls = new Set(existingFeeds.map((f) => f.url.toLowerCase()));

  const results = {
    added: 0,
    skipped: 0,
    errors: [],
  };

  for (const feed of feeds) {
    try {
      const urlLower = feed.url.toLowerCase();
      if (existingUrls.has(urlLower)) {
        results.skipped++;
        results.errors.push(`Duplicate URL: ${feed.url}`);
        continue;
      }

      if (!validateFeedUrl(feed.url)) {
        results.skipped++;
        results.errors.push(`Invalid URL: ${feed.url}`);
        continue;
      }

      const newFeed = {
        id: generateFeedId(feed.name),
        name: feed.name,
        url: feed.url,
        enabled: true,
        category: feed.category,
      };

      existingFeeds.push(newFeed);
      existingUrls.add(urlLower);
      results.added++;
    } catch (err) {
      results.skipped++;
      results.errors.push(`Error adding ${feed.name}: ${err.message}`);
    }
  }

  if (results.added > 0) {
    await writeFeedsConfig(existingFeeds);
  }

  return results;
}
