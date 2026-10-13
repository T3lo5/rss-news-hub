import { eq, sql } from 'drizzle-orm';
import { getDb, schema } from '../index.js';

export class NewsHashRepository {
  private get db() {
    return getDb();
  }
  private hashCache: Set<string> | null = null;

  async loadHashIndex(): Promise<void> {
    if (this.hashCache) return;
    const results = await this.db.select({ hash: schema.newsHashes.hash }).from(schema.newsHashes);
    this.hashCache = new Set(results.map((r) => r.hash));
  }

  async exists(hash: string): Promise<boolean> {
    if (this.hashCache) {
      return this.hashCache.has(hash);
    }
    const result = await this.db
      .select({ hash: schema.newsHashes.hash })
      .from(schema.newsHashes)
      .where(eq(schema.newsHashes.hash, hash))
      .limit(1);
    return result.length > 0;
  }

  async findByHash(hash: string): Promise<schema.NewsHash | undefined> {
    const result = await this.db
      .select()
      .from(schema.newsHashes)
      .where(eq(schema.newsHashes.hash, hash))
      .limit(1);
    return result[0];
  }

  async add(hash: string, newsId: string): Promise<void> {
    await this.db.insert(schema.newsHashes).values({ hash, newsId });
    if (this.hashCache) this.hashCache.add(hash);
  }

  async addMany(entries: Array<{ hash: string; newsId: string }>): Promise<void> {
    if (entries.length === 0) return;
    await this.db.insert(schema.newsHashes).values(entries);
    if (this.hashCache) {
      for (const e of entries) this.hashCache.add(e.hash);
    }
  }

  async remove(hash: string): Promise<boolean> {
    const result = await this.db.delete(schema.newsHashes).where(eq(schema.newsHashes.hash, hash));
    if (this.hashCache) this.hashCache.delete(hash);
    return result.changes > 0;
  }

  async count(): Promise<number> {
    const result = await this.db.select({ count: sql<number>`count(*)` }).from(schema.newsHashes);
    return result[0]?.count ?? 0;
  }

  async clear(): Promise<void> {
    await this.db.delete(schema.newsHashes);
    this.hashCache = null;
  }
}

export const newsHashRepository = new NewsHashRepository();
