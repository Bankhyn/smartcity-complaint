import { Router } from 'express';
import { complaintService } from '../../services/complaint.service.js';
import { officerService } from '../../services/officer.service.js';
import { notificationService } from '../../services/notification.service.js';

export const tasksApi = Router();

// GET /api/tasks/pending/:departmentId
tasksApi.get('/pending/:departmentId', async (req, res) => {
  const tasks = await complaintService.getByDepartment(Number(req.params.departmentId), 'accepted');
  res.json(tasks);
});

// GET /api/tasks/dispatched/:officerId
tasksApi.get('/dispatched/:officerId', async (req, res) => {
  const tasks = await complaintService.getByOfficer(Number(req.params.officerId), 'dispatched');
  res.json(tasks);
});

// POST /api/tasks/dispatch
tasksApi.post('/dispatch', async (req, res) => {
  const { officerId, complaintIds } = req.body as { officerId: number; complaintIds: number[] };

  const officer = await officerService.getById(officerId);
  if (!officer) return res.status(404).json({ error: 'Officer not found' });

  const dispatched = [];

  for (const cid of complaintIds) {
    const complaint = await complaintService.getById(cid);
    if (!complaint || complaint.status !== 'accepted') continue;

    await complaintService.dispatch(cid, officerId);

    const updated = await complaintService.getById(cid);
    if (updated) {
      await notificationService.notifyDispatch(updated, officer);
      dispatched.push(updated.refId);
    }
  }

  res.json({ success: true, dispatched });
});

// POST /api/tasks/close
tasksApi.post('/close', async (req, res) => {
  const { complaintId, resultStatus, note, photoUrl } = req.body as {
    complaintId: number;
    resultStatus: 'completed' | 'waiting' | 'failed';
    note?: string;
    photoUrl?: string;
  };

  const complaint = await complaintService.getById(complaintId);
  if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

  await complaintService.close(complaintId, resultStatus, note, photoUrl);

  const updated = await complaintService.getById(complaintId);
  if (updated) {
    await notificationService.notifyResult(updated);
  }

  res.json({ success: true, refId: complaint.refId, resultStatus });
});
