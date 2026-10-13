import { newsRepository, userProfileRepository } from '../src/db/repositories/index.js';
import { chat, pickProvider } from './ai.service.js';

const _DEFAULT_PROFILE = {
  keywords: [
    'AI',
    'machine learning',
    'LLM',
    'GPT',
    'open source',
    'Rust',
    'TypeScript',
    'Kubernetes',
    'cloud',
  ],
  topics: ['Artificial Intelligence', 'Software Engineering', 'Cloud Computing', 'Open Source'],
  preferredSources: [
    'OpenAI Blog',
    'Google DeepMind',
    'Hugging Face Blog',
    'GitHub Blog',
    'Vercel Blog',
  ],
  excludedKeywords: ['crypto', 'blockchain', 'NFT', 'memecoin'],
};

export async function readProfile() {
  const profile = await userProfileRepository.get();
  return {
    keywords: JSON.parse(profile.keywords || '[]'),
    topics: JSON.parse(profile.topics || '[]'),
    preferredSources: JSON.parse(profile.preferredSources || '[]'),
    excludedKeywords: JSON.parse(profile.excludedKeywords || '[]'),
  };
}

export async function writeProfile(profile) {
  await userProfileRepository.update('default', {
    keywords: profile.keywords || [],
    topics: profile.topics || [],
    preferredSources: profile.preferredSources || [],
    excludedKeywords: profile.excludedKeywords || [],
  });
}

function buildScoringPrompt(profile) {
  return `You are a relevance scoring engine. Score each article from 0-100 based on how relevant it is to the user's interests.

USER INTEREST PROFILE:
- Keywords: ${profile.keywords.join(', ')}
- Topics: ${profile.topics.join(', ')}
- Preferred Sources: ${profile.preferredSources.join(', ')}
- Excluded Keywords: ${profile.excludedKeywords.join(', ')}

SCORING RULES:
- 90-100: Highly relevant - matches multiple keywords/topics from preferred sources
- 70-89: Relevant - matches keywords/topics or from preferred sources
- 50-69: Moderately relevant - tangentially related
- 30-49: Low relevance - unrelated topics
- 0-29: Irrelevant - contains excluded keywords or completely unrelated

Return ONLY a JSON array of scores in the same order as input, e.g.: [85, 42, 91, 12]`;
}

function buildUserContent(items) {
  return items
    .map(
      (item, i) =>
        `${i + 1}. Title: ${item.title}\nSource: ${item.source}\nDescription: ${item.description?.slice(0, 500) || item.content?.slice(0, 500) || 'No description'}`
    )
    .join('\n\n');
}

export async function scoreItems(items, profile) {
  if (!items.length) return [];

  const provider = pickProvider('auto');
  if (!provider) {
    throw new Error('No AI provider configured');
  }

  const systemPrompt = buildScoringPrompt(profile);
  const userContent = buildUserContent(items);

  const response = await chat(systemPrompt, userContent, provider);

  try {
    const scores = JSON.parse(response);
    if (!Array.isArray(scores) || scores.length !== items.length) {
      throw new Error('Invalid score array');
    }
    return scores.map((score, i) => ({
      ...items[i],
      relevanceScore: Math.max(0, Math.min(100, Math.round(score))),
      scoredAt: Date.now(),
    }));
  } catch (err) {
    console.error('Failed to parse AI scores:', err);
    // Fallback: assign default scores
    return items.map((item) => ({
      ...item,
      relevanceScore: 50,
      scoredAt: Date.now(),
    }));
  }
}

export async function scoreNewItems(profile) {
  const unscored = await newsRepository.findUnscored();
  if (!unscored.length) {
    const allNews = await newsRepository.findAll();
    return { scored: 0, total: allNews.length };
  }

  const batchSize = 20;
  let scoredCount = 0;

  for (let i = 0; i < unscored.length; i += batchSize) {
    const batch = unscored.slice(i, i + batchSize);
    const scored = await scoreItems(batch, profile);

    // Update in database
    const updates = scored.map((item) => ({
      id: item.id,
      relevanceScore: item.relevanceScore,
    }));

    await newsRepository.updateRelevanceScores(updates);
    scoredCount += batch.length;
  }

  return { scored: scoredCount, total: unscored.length + scoredCount };
}
