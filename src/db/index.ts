import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import * as schema from './schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Go up from src/db -> src -> project root -> data
const DATA_DIR = resolve(__dirname, '..', '..', 'data');
const MIGRATIONS_DIR = join(__dirname, 'migrations');

let dbInstance: ReturnType<typeof drizzle> | null = null;
let customSqlite: Database.Database | null = null;

export function setTestDatabase(sqlite: Database.Database) {
  customSqlite = sqlite;
  dbInstance = drizzle(sqlite, { schema });
}

/**
 * Databases created with `drizzle-kit push` have their schema applied without
 * journal entries, so the migration SQL exists but was never recorded.
 * Drizzle decides what is pending purely by timestamp, and would re-run those
 * CREATE TABLE statements, hitting "table already exists" and rolling back the
 * whole batch (leaving a fresh install without any tables either).
 *
 * This detects migrations whose created tables are already all present and
 * records them as applied instead of re-running them.
 */
function recordOutOfBandMigrations(sqlite: Database.Database): void {
  const journalTable = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'"
    )
    .get();
  if (!journalTable) return; // brand-new database: nothing to repair

  const lastApplied =
    (
      sqlite.prepare('SELECT MAX(created_at) AS at FROM __drizzle_migrations').get() as {
        at: number | null;
      }
    ).at ?? 0;

  for (const migration of readMigrationFiles({ migrationsFolder: MIGRATIONS_DIR })) {
    if (migration.folderMillis <= lastApplied) continue;

    // Tables this migration creates. `__`-prefixed names are temporary rebuild
    // tables (created, copied into, then dropped by the migration itself).
    const createdTables = [
      ...new Set(
        migration.sql
          .flatMap((statement) => [
            ...statement.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?[`"']?(\w+)[`"']?/gi),
          ])
          .map((match) => match[1])
          .filter((name) => !name.startsWith('__'))
      ),
    ];
    if (createdTables.length === 0) continue;

    const alreadyApplied = createdTables.every((table) =>
      sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)
    );
    if (!alreadyApplied) continue;

    sqlite
      .prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
      .run(migration.hash, migration.folderMillis);
  }
}

export function getDb() {
  if (dbInstance) return dbInstance;

  if (customSqlite) {
    dbInstance = drizzle(customSqlite, { schema });
    return dbInstance;
  }

  const dbPath = join(DATA_DIR, 'rss-news-hub.db');
  // A fresh environment (e.g. an empty Docker volume) may not have the data
  // directory yet, and better-sqlite3 only creates the file, not its folder.
  mkdirSync(DATA_DIR, { recursive: true });

  const sqlite = new Database(dbPath);

  // Enable WAL mode for better concurrent access
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite, { schema });

  // Apply pending migrations on first boot so a brand-new database file ends
  // up with a complete schema. Drizzle records applied migrations itself, so
  // this is a no-op on every subsequent start.
  recordOutOfBandMigrations(sqlite);
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });

  dbInstance = db;
  return dbInstance;
}

export function closeDb() {
  // better-sqlite3 doesn't need explicit close for file-based DB
  dbInstance = null;
  customSqlite = null;
}

export function resetDb() {
  dbInstance = null;
}

export type {
  Bookmark,
  Feed,
  FeedCache,
  FeedStat,
  GlobalStat,
  NewBookmark,
  NewFeed,
  NewFeedCache,
  NewFeedStat,
  NewGlobalStat,
  NewNewsHash,
  NewNewsItem,
  NewNewsletterHistory,
  NewNewsSearch,
  NewsHash,
  NewsItem,
  NewsletterHistory,
  NewsSearch,
  NewTelegramQueue,
  NewTemplate,
  NewUser,
  NewUserProfile,
  TelegramQueue,
  Template,
  User,
  UserProfile,
} from './schema.js';
export { schema };
