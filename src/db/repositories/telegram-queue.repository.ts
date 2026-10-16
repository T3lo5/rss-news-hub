import { and, eq, lte } from 'drizzle-orm';
import { getDb, schema } from '../index.js';

export class TelegramQueueRepository {
  private get db() {
    return getDb();
  }

  async findAll(): Promise<schema.TelegramQueue[]> {
    return this.db.select().from(schema.telegramQueue).orderBy(schema.telegramQueue.scheduledAt);
  }

  async findPending(): Promise<schema.TelegramQueue[]> {
    const now = new Date();
    return this.db
      .select()
      .from(schema.telegramQueue)
      .where(
        and(eq(schema.telegramQueue.status, 'pending'), lte(schema.telegramQueue.scheduledAt, now))
      )
      .orderBy(schema.telegramQueue.scheduledAt);
  }

  async findById(id: string): Promise<schema.TelegramQueue | undefined> {
    const result = await this.db
      .select()
      .from(schema.telegramQueue)
      .where(eq(schema.telegramQueue.id, id))
      .limit(1);
    return result[0];
  }

  async findByUserId(userId: string): Promise<schema.TelegramQueue[]> {
    return this.db
      .select()
      .from(schema.telegramQueue)
      .where(eq(schema.telegramQueue.userId, userId))
      .orderBy(schema.telegramQueue.scheduledAt);
  }

  async add(message: schema.NewTelegramQueue): Promise<schema.TelegramQueue> {
    const result = await this.db.insert(schema.telegramQueue).values(message).returning();
    return result[0];
  }

  async updateStatus(
    id: string,
    status: 'pending' | 'sent' | 'failed',
    error?: string
  ): Promise<void> {
    const updates: Partial<schema.NewTelegramQueue> = { status };
    if (status === 'sent') {
      updates.sentAt = new Date();
    }
    if (error) {
      updates.lastError = error;
    }

    await this.db.update(schema.telegramQueue).set(updates).where(eq(schema.telegramQueue.id, id));
  }

  async incrementRetry(id: string, error: string): Promise<void> {
    // First get current retry count
    const msg = await this.findById(id);
    if (!msg) return;

    const newRetryCount = msg.retryCount + 1;
    const newStatus = newRetryCount >= 3 ? 'failed' : 'pending';

    await this.db
      .update(schema.telegramQueue)
      .set({
        retryCount: newRetryCount,
        lastError: error,
        status: newStatus,
      })
      .where(eq(schema.telegramQueue.id, id));
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.db
      .delete(schema.telegramQueue)
      .where(eq(schema.telegramQueue.id, id));
    return result.changes > 0;
  }

  async clear(): Promise<void> {
    await this.db.delete(schema.telegramQueue);
  }
}

export const telegramQueueRepository = new TelegramQueueRepository();
