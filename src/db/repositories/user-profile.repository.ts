import { eq, sql } from 'drizzle-orm';
import { getDb, schema } from '../index.js';

const DEFAULT_PROFILE = {
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

export class UserProfileRepository {
  private get db() {
    return getDb();
  }

  async get(id: string = 'default'): Promise<schema.UserProfile> {
    const result = await this.db
      .select()
      .from(schema.userProfiles)
      .where(eq(schema.userProfiles.id, id))
      .limit(1);

    if (result[0]) return result[0];

    // Create default profile
    const inserted = await this.db
      .insert(schema.userProfiles)
      .values({
        id,
        keywords: JSON.stringify(DEFAULT_PROFILE.keywords),
        topics: JSON.stringify(DEFAULT_PROFILE.topics),
        preferredSources: JSON.stringify(DEFAULT_PROFILE.preferredSources),
        excludedKeywords: JSON.stringify(DEFAULT_PROFILE.excludedKeywords),
      })
      .returning();
    return inserted[0];
  }

  async update(id: string, updates: Partial<schema.NewUserProfile>): Promise<schema.UserProfile> {
    const existing = await this.get(id);

    const merged = {
      keywords: updates.keywords ?? JSON.parse(existing.keywords),
      topics: updates.topics ?? JSON.parse(existing.topics),
      preferredSources: updates.preferredSources ?? JSON.parse(existing.preferredSources),
      excludedKeywords: updates.excludedKeywords ?? JSON.parse(existing.excludedKeywords),
    };

    const result = await this.db
      .update(schema.userProfiles)
      .set({
        keywords: JSON.stringify(merged.keywords),
        topics: JSON.stringify(merged.topics),
        preferredSources: JSON.stringify(merged.preferredSources),
        excludedKeywords: JSON.stringify(merged.excludedKeywords),
        updatedAt: sql`(strftime('%s', 'now') * 1000)`,
      })
      .where(eq(schema.userProfiles.id, id))
      .returning();

    return result[0];
  }

  async reset(id: string = 'default'): Promise<schema.UserProfile> {
    const result = await this.db
      .update(schema.userProfiles)
      .set({
        keywords: JSON.stringify(DEFAULT_PROFILE.keywords),
        topics: JSON.stringify(DEFAULT_PROFILE.topics),
        preferredSources: JSON.stringify(DEFAULT_PROFILE.preferredSources),
        excludedKeywords: JSON.stringify(DEFAULT_PROFILE.excludedKeywords),
        updatedAt: sql`(strftime('%s', 'now') * 1000)`,
      })
      .where(eq(schema.userProfiles.id, id))
      .returning();
    return result[0];
  }
}

export const userProfileRepository = new UserProfileRepository();
