import { eq, sql } from 'drizzle-orm';
import { getDb, schema } from '../index.js';

// Key/value access for admin-editable settings. Values are opaque JSON strings;
// callers own (de)serialization and secret encryption.
export class SettingsRepository {
  private get db() {
    return getDb();
  }

  async get(key: string): Promise<string | null> {
    const rows = await this.db
      .select()
      .from(schema.appSettings)
      .where(eq(schema.appSettings.key, key))
      .limit(1);
    return rows[0]?.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    await this.db
      .insert(schema.appSettings)
      .values({ key, value })
      .onConflictDoUpdate({
        target: schema.appSettings.key,
        set: { value, updatedAt: sql`(strftime('%s', 'now') * 1000)` },
      });
  }

  async remove(key: string): Promise<void> {
    await this.db.delete(schema.appSettings).where(eq(schema.appSettings.key, key));
  }
}

export const settingsRepository = new SettingsRepository();
