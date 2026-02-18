import { db, schema } from '../db/index.js';
import { eq, and, desc } from 'drizzle-orm';
import type { Platform } from '../types/index.js';

function generateRefId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `CMP-${date}-${rand}`;
}

export const complaintService = {
  async create(data: {
    userId: number;
    platform: Platform;
    issue: string;
    location?: string;
    latitude?: number;
    longitude?: number;
    photoUrl?: string;
    contactName?: string;
    contactPhone?: string;
    departmentId: number;
    aiDepartmentId: number;
    aiConfidence: number;
    category?: string;
    summary?: string;
  }) {
    const refId = generateRefId();
    const [result] = await db.insert(schema.complaints).values({
      refId,
      ...data,
      status: 'pending',
    }).returning();

    await this.logStatus(result.id, null, 'pending', 'created', 'system', null, 'AI classified');
    return result;
  },

  async getByRefId(refId: string) {
    const [row] = await db.select().from(schema.complaints).where(eq(schema.complaints.refId, refId));
    return row;
  },

  async getById(id: number) {
    const [row] = await db.select().from(schema.complaints).where(eq(schema.complaints.id, id));
    return row;
  },

  async accept(complaintId: number, data?: {
    acceptedBy?: string;
    assignedOfficerId?: number;
    scheduledDate?: string;
    acceptNote?: string;
  }) {
    await db.update(schema.complaints)
      .set({
        status: 'accepted',
        acceptedAt: new Date().toISOString(),
        acceptedBy: data?.acceptedBy,
        assignedOfficerId: data?.assignedOfficerId,
        scheduledDate: data?.scheduledDate,
        acceptNote: data?.acceptNote,
      })
      .where(eq(schema.complaints.id, complaintId));

    await this.logStatus(complaintId, 'pending', 'accepted', 'accepted', 'officer', data?.acceptedBy, data?.acceptNote);
  },

  async transfer(complaintId: number, newDepartmentId: number, rejectedBy?: string) {
    const complaint = await this.getById(complaintId);
    if (!complaint) return;

    await db.update(schema.complaints)
      .set({ departmentId: newDepartmentId, status: 'pending' })
      .where(eq(schema.complaints.id, complaintId));

    if (complaint.aiDepartmentId) {
      await db.insert(schema.aiCorrections).values({
        complaintId,
        issueText: complaint.issue,
        wrongDepartmentId: complaint.aiDepartmentId,
        correctDepartmentId: newDepartmentId,
      });
    }

    await this.logStatus(complaintId, complaint.status, 'pending', 'transferred', 'officer', rejectedBy,
      `Transferred to department ${newDepartmentId}`);
  },

  async dispatch(complaintId: number, officerId: number) {
    await db.update(schema.complaints)
      .set({
        status: 'dispatched',
        assignedOfficerId: officerId,
        dispatchedAt: new Date().toISOString(),
      })
      .where(eq(schema.complaints.id, complaintId));

    await this.logStatus(complaintId, 'accepted', 'dispatched', 'dispatched', 'officer', String(officerId));
  },

  async close(complaintId: number, resultStatus: 'completed' | 'waiting' | 'failed', note?: string, photoUrl?: string) {
    await db.update(schema.complaints)
      .set({
        status: resultStatus,
        resultStatus,
        resultNote: note,
        resultPhotoUrl: photoUrl,
        closedAt: new Date().toISOString(),
      })
      .where(eq(schema.complaints.id, complaintId));

    await this.logStatus(complaintId, 'dispatched', resultStatus, 'closed', 'officer', null, note);
  },

  async getByDepartment(departmentId: number, status?: string) {
    if (status) {
      return db.select().from(schema.complaints)
        .where(and(eq(schema.complaints.departmentId, departmentId), eq(schema.complaints.status, status)))
        .orderBy(desc(schema.complaints.createdAt));
    }
    return db.select().from(schema.complaints)
      .where(eq(schema.complaints.departmentId, departmentId))
      .orderBy(desc(schema.complaints.createdAt));
  },

  async getByOfficer(officerId: number, status?: string) {
    if (status) {
      return db.select().from(schema.complaints)
        .where(and(eq(schema.complaints.assignedOfficerId, officerId), eq(schema.complaints.status, status)))
        .orderBy(desc(schema.complaints.createdAt));
    }
    return db.select().from(schema.complaints)
      .where(eq(schema.complaints.assignedOfficerId, officerId))
      .orderBy(desc(schema.complaints.createdAt));
  },

  async getByUser(userId: number) {
    return db.select().from(schema.complaints)
      .where(eq(schema.complaints.userId, userId))
      .orderBy(desc(schema.complaints.createdAt));
  },

  async logStatus(complaintId: number, fromStatus: string | null, toStatus: string, action: string, actorType: string, actorId?: string | null, note?: string) {
    await db.insert(schema.statusLogs).values({
      complaintId,
      fromStatus,
      toStatus,
      action,
      actorType,
      actorId: actorId || undefined,
      note,
    });
  },
};
