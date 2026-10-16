import { and, eq, sql } from 'drizzle-orm';
import { getDb, schema } from '../index.js';

// Acesso à tabela user_settings (configuração por usuário: IA, Telegram, email,
// newsletter, digest). Valores são JSONs opacos; o chamador é responsável pela
// (de)serialização e criptografia de segredos.
export class UserSettingsRepository {
  private get db() {
    return getDb();
  }

  async get(userId: string, area: string): Promise<Record<string, unknown> | null> {
    const rows = await this.db
      .select()
      .from(schema.userSettings)
      .where(and(eq(schema.userSettings.userId, userId), eq(schema.userSettings.area, area)))
      .limit(1);
    if (!rows[0]) return null;
    try {
      const parsed = JSON.parse(rows[0].value);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  async getAllForUser(userId: string): Promise<Record<string, Record<string, unknown>>> {
    const rows = await this.db
      .select()
      .from(schema.userSettings)
      .where(eq(schema.userSettings.userId, userId));
    const result: Record<string, Record<string, unknown>> = {};
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.value);
        if (parsed && typeof parsed === 'object') {
          result[row.area] = parsed;
        }
      } catch {
        // Ignora valores corrompidos
      }
    }
    return result;
  }

  async set(userId: string, area: string, value: unknown): Promise<void> {
    const json = JSON.stringify(value ?? {});
    await this.db
      .insert(schema.userSettings)
      .values({ userId, area, value: json })
      .onConflictDoUpdate({
        target: [schema.userSettings.userId, schema.userSettings.area],
        set: { value: json, updatedAt: sql`(strftime('%s', 'now') * 1000)` },
      });
  }

  async remove(userId: string, area: string): Promise<void> {
    await this.db
      .delete(schema.userSettings)
      .where(and(eq(schema.userSettings.userId, userId), eq(schema.userSettings.area, area)));
  }
}

export const userSettingsRepository = new UserSettingsRepository();
