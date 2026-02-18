import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import type { Platform } from '../types/index.js';

export const userService = {
  async findOrCreate(platform: Platform, platformUserId: string, displayName?: string, pictureUrl?: string) {
    const field = platform === 'line' ? schema.users.lineUserId : schema.users.facebookPsid;
    const [existing] = await db.select().from(schema.users).where(eq(field, platformUserId));

    if (existing) {
      if (displayName && displayName !== existing.displayName) {
        await db.update(schema.users)
          .set({ displayName, pictureUrl })
          .where(eq(schema.users.id, existing.id));
      }
      return existing;
    }

    const [result] = await db.insert(schema.users).values({
      lineUserId: platform === 'line' ? platformUserId : undefined,
      facebookPsid: platform === 'facebook' ? platformUserId : undefined,
      displayName,
      pictureUrl,
      platform,
    }).returning();
    return result;
  },

  async getById(id: number) {
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    return row;
  },
};
