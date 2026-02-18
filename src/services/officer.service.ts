import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';

export const officerService = {
  async register(data: {
    lineUserId: string;
    lineDisplayName?: string;
    name: string;
    position?: string;
    phone: string;
    departmentId: number;
  }) {
    const [existing] = await db.select().from(schema.officers)
      .where(eq(schema.officers.lineUserId, data.lineUserId));

    if (existing) {
      await db.update(schema.officers)
        .set({
          name: data.name,
          lineDisplayName: data.lineDisplayName,
          position: data.position,
          phone: data.phone,
          departmentId: data.departmentId,
        })
        .where(eq(schema.officers.id, existing.id));
      return { ...existing, ...data, updated: true };
    }

    const [result] = await db.insert(schema.officers).values(data).returning();
    return result;
  },

  async getByLineUserId(lineUserId: string) {
    const [row] = await db.select().from(schema.officers)
      .where(eq(schema.officers.lineUserId, lineUserId));
    return row;
  },

  async getById(id: number) {
    const [row] = await db.select().from(schema.officers)
      .where(eq(schema.officers.id, id));
    return row;
  },

  async getByDepartment(departmentId: number) {
    return db.select().from(schema.officers)
      .where(eq(schema.officers.departmentId, departmentId));
  },
};
