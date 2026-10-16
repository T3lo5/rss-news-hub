import { desc, eq, and, inArray, sql } from 'drizzle-orm';
import { getDb, schema } from '../index.js';

export class BookmarkRepository {
  private get db() {
    return getDb();
  }

  async findAll(userId: string): Promise<schema.Bookmark[]> {
    return this.db
      .select()
      .from(schema.bookmarks)
      .where(eq(schema.bookmarks.userId, userId))
      .orderBy(desc(schema.bookmarks.bookmarkedAt));
  }

  async findByNewsId(userId: string, newsId: string): Promise<schema.Bookmark | undefined> {
    const result = await this.db
      .select()
      .from(schema.bookmarks)
      .where(and(eq(schema.bookmarks.userId, userId), eq(schema.bookmarks.newsId, newsId)))
      .limit(1);
    return result[0];
  }

  async findByNewsIds(userId: string, newsIds: string[]): Promise<schema.Bookmark[]> {
    if (newsIds.length === 0) return [];
    return this.db
      .select()
      .from(schema.bookmarks)
      .where(and(eq(schema.bookmarks.userId, userId), inArray(schema.bookmarks.newsId, newsIds)));
  }

  async add(userId: string, bookmark: Omit<schema.NewBookmark, 'userId'>): Promise<schema.Bookmark> {
    const existing = await this.findByNewsId(userId, bookmark.newsId);
    if (existing) return existing;

    const result = await this.db
      .insert(schema.bookmarks)
      .values({ ...bookmark, userId })
      .returning();
    return result[0];
  }

  async remove(userId: string, newsId: string): Promise<boolean> {
    const result = await this.db
      .delete(schema.bookmarks)
      .where(and(eq(schema.bookmarks.userId, userId), eq(schema.bookmarks.newsId, newsId)));
    return result.changes > 0;
  }

  async getBookmarkedNewsIds(userId: string): Promise<Set<string>> {
    const results = await this.db
      .select({ newsId: schema.bookmarks.newsId })
      .from(schema.bookmarks)
      .where(eq(schema.bookmarks.userId, userId));
    return new Set(results.map((r) => r.newsId));
  }

  async count(userId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.bookmarks)
      .where(eq(schema.bookmarks.userId, userId));
    return result[0]?.count ?? 0;
  }
}

export const bookmarkRepository = new BookmarkRepository();
