import { fetchAllFeeds } from './fetch.service.js';
import { readProfile, scoreNewItems } from './relevance.service.js';

/**
 * Fetch all feeds and score the items that arrived in the same cycle.
 *
 * The scheduler used to call `fetchAllFeeds` directly, so news that arrived in
 * the background stayed with `relevanceScore = NULL` until someone triggered a
 * fetch or a digest by hand. Scoring is best-effort: if the AI provider is
 * missing or fails, the fetched news is still returned and saved.
 *
 * Dependencies are injectable so tests can exercise the orchestration without
 * hitting feeds or AI providers.
 */
export async function fetchAndScoreFeeds(deps = {}) {
  const fetchFeeds = deps.fetchFeeds || fetchAllFeeds;
  const scorePending = deps.scorePending || scoreNewItems;
  const getProfile = deps.getProfile || readProfile;
  const warn = deps.warn || console.warn;

  const result = await fetchFeeds();

  try {
    const profile = await getProfile();
    const scoring = await scorePending(profile);
    return { ...result, scoring };
  } catch (err) {
    warn(`Relevance scoring skipped: ${err?.message || err}`);
    return result;
  }
}
