import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema.js';
import { resolve } from 'path';
import { mkdirSync } from 'fs';

const dbDir = resolve('data');
mkdirSync(dbDir, { recursive: true });

const dbPath = resolve('data/smartcity.db');
const client = createClient({ url: `file:${dbPath}` });

export const db = drizzle(client, { schema });
export { schema };
