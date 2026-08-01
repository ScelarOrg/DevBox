import { getSqlite } from "@server/db";

/**
 * Create Better Auth + app tables (no drizzle-kit / Better Auth CLI in Nodepod).
 * When you add a table to /server/schema.ts, add a matching
 * CREATE TABLE IF NOT EXISTS INSIDE the sqlite.exec(`...`) template literal
 * below — before the closing backtick. Never put SQL as bare JS statements
 * outside that string (that causes a parse error and breaks the server).
 */
export function ensureSchema(): void {
  const sqlite = getSqlite();

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS user (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      email_verified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY NOT NULL,
      expires_at INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS session_user_id_idx ON session(user_id);

    CREATE TABLE IF NOT EXISTS account (
      id TEXT PRIMARY KEY NOT NULL,
      account_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      access_token TEXT,
      refresh_token TEXT,
      id_token TEXT,
      access_token_expires_at INTEGER,
      refresh_token_expires_at INTEGER,
      scope TEXT,
      password TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS account_user_id_idx ON account(user_id);

    CREATE TABLE IF NOT EXISTS verification (
      id TEXT PRIMARY KEY NOT NULL,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER,
      updated_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification(identifier);

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS notes_user_id_idx ON notes(user_id);

    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY NOT NULL,
      owner_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      parent_id TEXT,
      type TEXT NOT NULL DEFAULT 'page',
      title TEXT NOT NULL DEFAULT '',
      icon TEXT,
      cover TEXT,
      content TEXT NOT NULL DEFAULT '[]',
      sort_order INTEGER NOT NULL DEFAULT 0,
      trashed_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS pages_owner_id_idx ON pages(owner_id);
    CREATE INDEX IF NOT EXISTS pages_parent_id_idx ON pages(parent_id);

    CREATE TABLE IF NOT EXISTS db_properties (
      id TEXT PRIMARY KEY NOT NULL,
      database_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      options TEXT NOT NULL DEFAULT '{}',
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS db_properties_database_id_idx ON db_properties(database_id);

    CREATE TABLE IF NOT EXISTS db_rows (
      id TEXT PRIMARY KEY NOT NULL,
      database_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '',
      properties TEXT NOT NULL DEFAULT '{}',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS db_rows_database_id_idx ON db_rows(database_id);
    -- More app tables: add CREATE TABLE IF NOT EXISTS above this line (still inside this string).
  `);
}
