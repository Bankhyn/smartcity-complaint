import { Router } from 'express';
import { officerService } from '../../services/officer.service.js';
import { db, schema } from '../../db/index.js';

export const officersApi = Router();

// POST /api/officers/register
officersApi.post('/register', async (req, res) => {
  const { lineUserId, name, position, phone, departmentId } = req.body;

  if (!lineUserId || !name || !phone || !departmentId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const officer = await officerService.register({
    lineUserId, name, position, phone, departmentId: Number(departmentId),
  });
  res.json({ success: true, officer });
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

// GET /api/departments/list
officersApi.get('/departments/list', async (_req, res) => {
  const departments = await db.select().from(schema.departments);
  res.json(departments);
});
