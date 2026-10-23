import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '../index.js';

/**
 * Estado de leitura por usuário (`news_reads`).
 *
 * A ausência de linha significa "não lida", então desmarcar apaga a linha em
 * vez de gravar NULL. Marcar de novo mantém o `read_at` original para que a
 * ordenação/auditoria não mude a cada clique.
 */
export class NewsReadRepository {
  private get db() {
    return getDb();
  }

  async findAllForUser(userId: string): Promise<Map<string, Date>> {
    const rows = await this.db
      .select()
      .from(schema.newsReads)
      .where(eq(schema.newsReads.userId, userId));

    return new Map(rows.map((row) => [row.newsId, row.readAt]));
  }

  /** Idempotente: devolve o `read_at` efetivo, ou null quando desmarcada. */
  async setRead(userId: string, newsId: string, read: boolean): Promise<Date | null> {
    if (!read) {
      await this.db
        .delete(schema.newsReads)
        .where(and(eq(schema.newsReads.userId, userId), eq(schema.newsReads.newsId, newsId)));
      return null;
    }

    await this.db.insert(schema.newsReads).values({ userId, newsId }).onConflictDoNothing();

    const rows = await this.db
      .select()
      .from(schema.newsReads)
      .where(and(eq(schema.newsReads.userId, userId), eq(schema.newsReads.newsId, newsId)))
      .limit(1);

    return rows[0]?.readAt ?? null;
  }
}

export const newsReadRepository = new NewsReadRepository();
