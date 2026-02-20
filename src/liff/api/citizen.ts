import { Router } from 'express';
import { db, schema } from '../../db/index.js';
import { eq, desc } from 'drizzle-orm';
import { complaintService } from '../../services/complaint.service.js';
import { aiClassifier } from '../../services/ai-classifier.service.js';

export const citizenApi = Router();

// ========== POST /register — ลงทะเบียนประชาชน ==========
citizenApi.post('/register', async (req, res) => {
  try {
    const { lineUserId, displayName, phone, address, pictureUrl } = req.body;
    if (!displayName || !phone) {
      return res.status(400).json({ error: 'กรุณากรอกชื่อและเบอร์โทร' });
    }

    // Find existing user by lineUserId
    let user;
    if (lineUserId) {
      [user] = await db.select().from(schema.users)
        .where(eq(schema.users.lineUserId, lineUserId));
    }

    const now = new Date().toISOString();

    if (user) {
      // Update existing
      await db.update(schema.users)
        .set({ displayName, phone, address, pictureUrl, pdpaConsentAt: user.pdpaConsentAt || now })
        .where(eq(schema.users.id, user.id));
      const [updated] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
      res.json({ success: true, user: updated });
    } else {
      // Create new
      const [newUser] = await db.insert(schema.users).values({
        lineUserId: lineUserId || undefined,
        displayName,
        phone,
        address,
        pictureUrl,
        pdpaConsentAt: now,
        platform: lineUserId ? 'line' : 'web',
      }).returning();
      res.json({ success: true, user: newUser });
    }
  } catch (e: any) {
    console.error('[citizen/register]', e);
    res.status(500).json({ error: e.message });
  }
});

// ========== GET /me — ดึงข้อมูลประชาชน ==========
citizenApi.get('/me', async (req, res) => {
  try {
    const lineUserId = req.query.lineUserId as string;
    if (!lineUserId) return res.status(400).json({ error: 'Missing lineUserId' });

    const [user] = await db.select().from(schema.users)
      .where(eq(schema.users.lineUserId, lineUserId));

    if (!user) return res.status(404).json({ error: 'ไม่พบข้อมูล' });
    res.json(user);
  } catch (e: any) {
    console.error('[citizen/me]', e);
    res.status(500).json({ error: e.message });
  }
});

// ========== POST /classify — AI วิเคราะห์ปัญหา ==========
citizenApi.post('/classify', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Missing text' });

    const result = await aiClassifier.classify(text);

    // Get department name
    const [dept] = await db.select().from(schema.departments)
      .where(eq(schema.departments.code, result.department));

    res.json({
      ...result,
      departmentName: dept?.name || result.department,
      departmentId: dept?.id,
    });
  } catch (e: any) {
    console.error('[citizen/classify]', e);
    res.status(500).json({ error: e.message });
  }
});

// ========== POST /complaints — สร้างเรื่องร้องเรียนจากเว็บ ==========
citizenApi.post('/complaints', async (req, res) => {
  try {
    const {
      issue, location, latitude, longitude, photoUrl,
      contactName, contactPhone,
      departmentId, category, summary,
      lineUserId,
    } = req.body;

    if (!issue || !contactName || !contactPhone) {
      return res.status(400).json({ error: 'กรุณากรอก: ปัญหา, ชื่อ, เบอร์โทร' });
    }

    // Find or create user
    let user;
    if (lineUserId) {
      [user] = await db.select().from(schema.users)
        .where(eq(schema.users.lineUserId, lineUserId));
    }
    if (!user) {
      [user] = await db.insert(schema.users).values({
        displayName: contactName,
        phone: contactPhone,
        platform: 'web',
        lineUserId: lineUserId || undefined,
      }).returning();
    }

    // AI classify if no department given
    let deptId = departmentId;
    let aiDeptId = departmentId;
    let aiConfidence = 0.9;
    let cat = category;
    let sum = summary;

    if (!deptId) {
      const classification = await aiClassifier.classify(issue);
      const [dept] = await db.select().from(schema.departments)
        .where(eq(schema.departments.code, classification.department));
      deptId = dept?.id || 1;
      aiDeptId = deptId;
      aiConfidence = classification.confidence;
      cat = classification.category;
      sum = classification.summary;
    }

    const complaint = await complaintService.create({
      userId: user.id,
      platform: 'web' as any,
      issue,
      location,
      latitude,
      longitude,
      photoUrl,
      contactName,
      contactPhone,
      departmentId: deptId,
      aiDepartmentId: aiDeptId,
      aiConfidence,
      category: cat,
      summary: sum,
    });

    // Notify LINE groups (best-effort)
    try {
      const { notificationService } = await import('../../services/notification.service.js');
      const [dept] = complaint.departmentId
        ? await db.select().from(schema.departments).where(eq(schema.departments.id, complaint.departmentId))
        : [null];
      await notificationService.notifyNewComplaint(complaint, dept, user);
    } catch (e) {
      console.error('[citizen] notification error (non-fatal):', e);
    }

    res.json({ success: true, refId: complaint.refId, complaint });
  } catch (e: any) {
    console.error('[citizen/complaints]', e);
    res.status(500).json({ error: e.message });
  }
});

// ========== GET /complaints/:refId — ติดตามเรื่อง ==========
citizenApi.get('/complaints/:refId', async (req, res) => {
  try {
    const complaint = await complaintService.getByRefId(req.params.refId);
    if (!complaint) return res.status(404).json({ error: 'ไม่พบเรื่องร้องเรียน' });

    // Status logs (timeline)
    const logs = await db.select().from(schema.statusLogs)
      .where(eq(schema.statusLogs.complaintId, complaint.id))
      .orderBy(schema.statusLogs.createdAt);

    // Department
    const [dept] = complaint.departmentId
      ? await db.select().from(schema.departments).where(eq(schema.departments.id, complaint.departmentId))
      : [null];

    // Assigned officer
    let officer = null;
    if (complaint.assignedOfficerId) {
      const [off] = await db.select().from(schema.officers)
        .where(eq(schema.officers.id, complaint.assignedOfficerId));
      if (off) {
        officer = { id: off.id, name: off.name, position: off.position, phone: off.phone };
      }
    }

    res.json({
      complaint,
      department: dept ? { id: dept.id, name: dept.name, code: dept.code } : null,
      officer,
      statusLogs: logs,
    });
  } catch (e: any) {
    console.error('[citizen/track]', e);
    res.status(500).json({ error: e.message });
  }
});

// ========== GET /stats — สถิติสาธารณะ ==========
citizenApi.get('/stats', async (_req, res) => {
  try {
    const all = await db.select().from(schema.complaints);
    const ratings = await db.select().from(schema.satisfactionRatings);

    const total = all.length;
    const pending = all.filter(c => ['pending', 'accepted'].includes(c.status)).length;
    const inProgress = all.filter(c => c.status === 'dispatched').length;
    const completed = all.filter(c => c.status === 'completed').length;
    const avgSatisfaction = ratings.length > 0
      ? Math.round(ratings.reduce((s, r) => s + (r.systemRating || 0), 0) / ratings.length * 10) / 10
      : null;

    res.json({ total, pending, inProgress, completed, avgSatisfaction });
  } catch (e: any) {
    console.error('[citizen/stats]', e);
    res.status(500).json({ error: e.message });
  }
});
