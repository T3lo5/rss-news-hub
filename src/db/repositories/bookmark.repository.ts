import { desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb, schema } from '../index.js';

export class BookmarkRepository {
  private get db() {
    return getDb();
  }

  async findAll(): Promise<schema.Bookmark[]> {
    return this.db.select().from(schema.bookmarks).orderBy(desc(schema.bookmarks.bookmarkedAt));
  }

  async findByNewsId(newsId: string): Promise<schema.Bookmark | undefined> {
    const result = await this.db
      .select()
      .from(schema.bookmarks)
      .where(eq(schema.bookmarks.newsId, newsId))
      .limit(1);
    return result[0];
  }

  async findByNewsIds(newsIds: string[]): Promise<schema.Bookmark[]> {
    if (newsIds.length === 0) return [];
    return this.db.select().from(schema.bookmarks).where(inArray(schema.bookmarks.newsId, newsIds));
  }

  async add(bookmark: schema.NewBookmark): Promise<schema.Bookmark> {
    const existing = await this.findByNewsId(bookmark.newsId);
    if (existing) return existing;

    const result = await this.db.insert(schema.bookmarks).values(bookmark).returning();
    return result[0];
  }

  async remove(newsId: string): Promise<boolean> {
    const result = await this.db
      .delete(schema.bookmarks)
      .where(eq(schema.bookmarks.newsId, newsId));
    return result.changes > 0;
  }

  async getBookmarkedNewsIds(): Promise<Set<string>> {
    const results = await this.db
      .select({ newsId: schema.bookmarks.newsId })
      .from(schema.bookmarks);
    return new Set(results.map((r) => r.newsId));
  }

  async count(): Promise<number> {
    const result = await this.db.select({ count: sql<number>`count(*)` }).from(schema.bookmarks);
    return result[0]?.count ?? 0;
  }
}

export const bookmarkRepository = new BookmarkRepository();
