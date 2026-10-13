import { createHash } from 'node:crypto';
import { newsHashRepository } from '../src/db/repositories/index.js';

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    const trackingParams = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'utm_id',
      'utm_source_platform',
      'utm_creative_format',
      'utm_marketing_tactic',
      'fbclid',
      'gclid',
      'ref',
      'source',
      'mc_cid',
      'mc_eid',
      'igshid',
      'twclid',
      'msclkid',
      'ttclid',
      'li_fat_id',
      'dm_i',
      'utm_v2',
      'sc_campaign',
      'sc_channel',
      'sc_content',
      'sc_publisher',
      'sc_country',
      'pk_campaign',
      'pk_kwd',
      'wt_mc_id',
      'wt_mc_ev',
      'wt_src',
      'wt_ad',
      'wt_mc',
      'wt_campaign',
    ];
    // Delete tracking params case-insensitively - collect keys first
    const lowerParams = new Set(trackingParams.map((p) => p.toLowerCase()));
    const keysToDelete = [];
    for (const [key] of u.searchParams) {
      if (lowerParams.has(key.toLowerCase())) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      u.searchParams.delete(key);
    }
    // Normalize: lowercase host and path
    u.host = u.host.toLowerCase();
    u.pathname = u.pathname.toLowerCase();
    // Ensure trailing slash
    if (!u.pathname.endsWith('/')) {
      u.pathname += '/';
    }
    return u.toString();
  } catch {
    // If URL parsing fails, return as-is (will still hash consistently)
    return url.toLowerCase();
  }
}

function linkHash(url) {
  const normalized = normalizeUrl(url);
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

async function isDuplicate(hash) {
  return newsHashRepository.exists(hash);
}

async function addToIndex(hash, newsId) {
  await newsHashRepository.add(hash, newsId);
}

async function loadHashIndex() {
  await newsHashRepository.loadHashIndex();
}

function getIndexStats() {
  return newsHashRepository.count();
}

function __resetIndex() {
  return newsHashRepository.clear();
}

export {
  __resetIndex,
  addToIndex,
  getIndexStats,
  isDuplicate,
  linkHash,
  loadHashIndex,
  normalizeUrl,
};
