import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema.js';
import { resolve } from 'path';

const dbPath = resolve('data/smartcity.db');
const client = createClient({ url: `file:${dbPath}` });

export const db = drizzle(client, { schema });
export { schema };
