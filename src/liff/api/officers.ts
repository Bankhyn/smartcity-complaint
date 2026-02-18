import { Router } from 'express';
import { officerService } from '../../services/officer.service.js';
import { db, schema } from '../../db/index.js';
import { eq } from 'drizzle-orm';

export const officersApi = Router();

// POST /api/officers/register
officersApi.post('/register', async (req, res) => {
  const { lineUserId, lineDisplayName, name, position, phone, departmentId } = req.body;

  if (!lineUserId || !name || !phone || !departmentId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (name.length < 4) {
    return res.status(400).json({ error: 'กรุณากรอกชื่อ-นามสกุลจริง' });
  }

  const officer = await officerService.register({
    lineUserId, lineDisplayName, name, position, phone, departmentId: Number(departmentId),
  });
  res.json({ success: true, officer });
});

// GET /api/officers/by-id/:id — ดึงเจ้าหน้าที่ตาม ID
officersApi.get('/by-id/:id', async (req, res) => {
  const officer = await officerService.getById(Number(req.params.id));
  if (!officer) return res.status(404).json({ error: 'Not found' });
  res.json(officer);
});

// GET /api/officers/by-department/:departmentId
officersApi.get('/by-department/:departmentId', async (req, res) => {
  const officers = await officerService.getByDepartment(Number(req.params.departmentId));
  res.json(officers);
});

// GET /api/officers/:lineUserId
officersApi.get('/:lineUserId', async (req, res) => {
  const officer = await officerService.getByLineUserId(req.params.lineUserId);
  if (!officer) return res.status(404).json({ error: 'Not found' });
  res.json(officer);
});

// POST /api/officers/unregister — ลบทะเบียนเจ้าหน้าที่
officersApi.post('/unregister', async (req, res) => {
  try {
    const { lineUserId } = req.body;
    if (!lineUserId) return res.status(400).json({ error: 'Missing lineUserId' });
    const officer = await officerService.getByLineUserId(lineUserId);
    if (!officer) return res.status(404).json({ error: 'Not found' });

    // ปลด officer จาก complaints ก่อนลบ
    await db.update(schema.complaints)
      .set({ assignedOfficerId: null })
      .where(eq(schema.complaints.assignedOfficerId, officer.id));

    await db.delete(schema.officers).where(eq(schema.officers.lineUserId, lineUserId));
    res.json({ success: true });
  } catch (err) {
    console.error('Unregister error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

// GET /api/departments/list
officersApi.get('/departments/list', async (_req, res) => {
  const departments = await db.select().from(schema.departments);
  res.json(departments);
});
