import { Router } from 'express';
import { complaintService } from '../../services/complaint.service.js';
import { officerService } from '../../services/officer.service.js';
import { notificationService } from '../../services/notification.service.js';

export const tasksApi = Router();

// GET /api/tasks/pending/:officerId — ดึงงานเฉพาะกองของเจ้าหน้าที่
tasksApi.get('/pending/:officerId', async (req, res) => {
  const officer = await officerService.getById(Number(req.params.officerId));
  if (!officer) return res.status(404).json({ error: 'Officer not found' });
  const tasks = await complaintService.getByDepartment(officer.departmentId, 'accepted');
  res.json(tasks);
});

// GET /api/tasks/dispatched/:officerId
tasksApi.get('/dispatched/:officerId', async (req, res) => {
  const tasks = await complaintService.getByOfficer(Number(req.params.officerId), 'dispatched');
  res.json(tasks);
});

// GET /api/tasks/complaint/:refId — ดึงข้อมูลคำร้องสำหรับหน้ารับเรื่อง
tasksApi.get('/complaint/:refId', async (req, res) => {
  const complaint = await complaintService.getByRefId(req.params.refId);
  if (!complaint) return res.status(404).json({ error: 'Complaint not found' });
  res.json(complaint);
});

// POST /api/tasks/accept — รับเรื่อง + มอบหมาย + กำหนดวัน
tasksApi.post('/accept', async (req, res) => {
  const { refId, acceptedBy, assignedOfficerId, scheduledDate, acceptNote } = req.body as {
    refId: string;
    acceptedBy: string;
    assignedOfficerId?: number;
    scheduledDate?: string;
    acceptNote?: string;
  };

  const complaint = await complaintService.getByRefId(refId);
  if (!complaint) return res.status(404).json({ error: 'Complaint not found' });
  if (complaint.status !== 'pending') return res.status(400).json({ error: 'Complaint already processed' });

  await complaintService.accept(complaint.id, {
    acceptedBy,
    assignedOfficerId: assignedOfficerId || undefined,
    scheduledDate: scheduledDate || undefined,
    acceptNote: acceptNote || undefined,
  });

  res.json({ success: true, refId: complaint.refId });
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
