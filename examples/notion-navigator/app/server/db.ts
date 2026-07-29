import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { drizzle } from "drizzle-orm/node-sqlite";
import * as schema from "@server/schema";

const DB_PATH = "/.data/app.sqlite";

function ensureDbDir(): void {
  try {
    mkdirSync(dirname(DB_PATH), { recursive: true });
  } catch {
    // ignore if already exists
  }
}

let sqlite: DatabaseSync | null = null;
let db: ReturnType<typeof createDb> | null = null;

function createDb(client: DatabaseSync) {
  return drizzle({ client, schema });
}

/** Raw node:sqlite client (for CREATE TABLE in ensure-schema). */
export function getSqlite(): DatabaseSync {
  if (!sqlite) {
    ensureDbDir();
    sqlite = new DatabaseSync(DB_PATH);
    sqlite.exec("PRAGMA journal_mode = WAL;");
    sqlite.exec("PRAGMA foreign_keys = ON;");
  }
  return sqlite;
}

/** Shared Drizzle database for Better Auth and app data. */
export function getDb() {
  if (!db) {
    db = createDb(getSqlite());
  }
  return db;
}

export type Db = ReturnType<typeof getDb>;
