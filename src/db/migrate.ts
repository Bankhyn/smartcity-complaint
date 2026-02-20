import { createClient } from '@libsql/client';
import { resolve } from 'path';

const dbPath = resolve('data/smartcity.db');
const client = createClient({ url: `file:${dbPath}` });

const tables = [
  `CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    line_group_id TEXT,
    keywords TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    line_user_id TEXT,
    facebook_psid TEXT,
    display_name TEXT,
    phone TEXT,
    picture_url TEXT,
    platform TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS officers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    line_user_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    position TEXT,
    phone TEXT NOT NULL,
    department_id INTEGER NOT NULL REFERENCES departments(id),
    is_active INTEGER NOT NULL DEFAULT 1,
    registered_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS complaints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ref_id TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    platform TEXT NOT NULL,
    issue TEXT NOT NULL,
    category TEXT,
    summary TEXT,
    location TEXT,
    latitude REAL,
    longitude REAL,
    photo_url TEXT,
    contact_name TEXT,
    contact_phone TEXT,
    department_id INTEGER REFERENCES departments(id),
    ai_department_id INTEGER REFERENCES departments(id),
    ai_confidence REAL,
    status TEXT NOT NULL DEFAULT 'pending',
    assigned_officer_id INTEGER REFERENCES officers(id),
    accepted_by TEXT,
    accept_note TEXT,
    scheduled_date TEXT,
    result_status TEXT,
    result_note TEXT,
    result_photo_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    accepted_at TEXT,
    dispatched_at TEXT,
    closed_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS status_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    complaint_id INTEGER NOT NULL REFERENCES complaints(id),
    from_status TEXT,
    to_status TEXT NOT NULL,
    action TEXT NOT NULL,
    actor_type TEXT NOT NULL,
    actor_id TEXT,
    note TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform_user_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'idle',
    data TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS ai_corrections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    complaint_id INTEGER NOT NULL REFERENCES complaints(id),
    issue_text TEXT NOT NULL,
    wrong_department_id INTEGER REFERENCES departments(id),
    correct_department_id INTEGER NOT NULL REFERENCES departments(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS satisfaction_ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    complaint_id INTEGER NOT NULL REFERENCES complaints(id),
    system_rating INTEGER,
    officer_rating INTEGER,
    comment TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
];

const alterations = [
  `ALTER TABLE complaints ADD COLUMN accepted_by TEXT`,
  `ALTER TABLE complaints ADD COLUMN accept_note TEXT`,
  `ALTER TABLE complaints ADD COLUMN scheduled_date TEXT`,
  `ALTER TABLE officers ADD COLUMN line_display_name TEXT`,
  `ALTER TABLE users ADD COLUMN address TEXT`,
  `ALTER TABLE users ADD COLUMN pdpa_consent_at TEXT`,
];

export async function runMigrations() {
  console.log('  📦 Running migrations...');
  for (const sql of tables) {
    await client.execute(sql);
  }
  for (const sql of alterations) {
    try { await client.execute(sql); } catch { /* column already exists */ }
  }
  console.log('  ✅ Tables ready');
}
