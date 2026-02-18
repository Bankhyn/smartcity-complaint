import { lineAdapter } from '../adapters/line.adapter.js';
import { complaintService } from '../services/complaint.service.js';
import { officerService } from '../services/officer.service.js';
import { notificationService } from '../services/notification.service.js';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { env } from '../config/env.js';
import type { UnifiedMessage, DepartmentCode } from '../types/index.js';

export async function handleGroupPostback(msg: UnifiedMessage) {
  const params = new URLSearchParams(msg.postbackData || '');
  const action = params.get('action');
  const complaintRefId = params.get('complaintId');
  if (!complaintRefId) return;

  const complaint = await complaintService.getByRefId(complaintRefId);
  if (!complaint) return;

  switch (action) {
    case 'accept': {
      // เปิด LIFF หน้ารับเรื่อง (ถูกเปลี่ยนเป็น URI action แล้ว — fallback สำหรับ postback เก่า)
      await complaintService.accept(complaint.id, { acceptedBy: msg.senderId });
      if (msg.replyToken) {
        await lineAdapter.replyText(msg.replyToken, `✅ รับเรื่อง ${complaintRefId} เรียบร้อย`);
      }
      break;
    }

    case 'reject': {
      await notificationService.sendDepartmentSelect(msg.chatId, complaintRefId);
      break;
    }

    case 'transfer': {
      const deptCode = params.get('dept') as DepartmentCode;
      if (!deptCode) return;

      const [newDept] = await db.select().from(schema.departments).where(eq(schema.departments.code, deptCode));
      if (!newDept) return;

      const [oldDept] = complaint.departmentId
        ? await db.select().from(schema.departments).where(eq(schema.departments.id, complaint.departmentId))
        : [undefined as any];

      await complaintService.transfer(complaint.id, newDept.id, msg.senderId);

      const updated = await complaintService.getById(complaint.id);
      if (updated) {
        await notificationService.notifyTransfer(updated, newDept, oldDept?.name || 'ไม่ทราบ');
      }

      if (msg.replyToken) {
        await lineAdapter.replyText(msg.replyToken, `🔄 โอน ${complaintRefId} ไป${newDept.name}เรียบร้อย`);
      }
      break;
    }
  }
}

export async function handleGroupCommand(msg: UnifiedMessage) {
  const text = msg.text?.trim() || '';

  if (text === '/ลงทะเบียน') {
    const liffUrl = `https://liff.line.me/${env.liffId}/register`;
    if (msg.replyToken) {
      await lineAdapter.replyText(msg.replyToken, `📝 กรุณาลงทะเบียนที่ลิงก์นี้ค่ะ\n${liffUrl}`);
    }
    return;
  }

  if (text === '/ออกปฏิบัติงาน') {
    const officer = await officerService.getByLineUserId(msg.senderId);
    if (!officer) {
      if (msg.replyToken) {
        await lineAdapter.replyText(msg.replyToken, '❌ กรุณาลงทะเบียนก่อนนะคะ พิมพ์ /ลงทะเบียน');
      }
      return;
    }
    const liffUrl = `https://liff.line.me/${env.liffId}/dispatch?officerId=${officer.id}`;
    if (msg.replyToken) {
      await lineAdapter.replyText(msg.replyToken, `📋 เลือกงานที่จะออกปฏิบัติงานได้ที่ลิงก์นี้ค่ะ\n${liffUrl}`);
    }
    return;
  }

  if (text === '/ปิดงาน') {
    const officer = await officerService.getByLineUserId(msg.senderId);
    if (!officer) {
      if (msg.replyToken) {
        await lineAdapter.replyText(msg.replyToken, '❌ กรุณาลงทะเบียนก่อนนะคะ พิมพ์ /ลงทะเบียน');
      }
      return;
    }
    const liffUrl = `https://liff.line.me/${env.liffId}/close-task?officerId=${officer.id}`;
    if (msg.replyToken) {
      await lineAdapter.replyText(msg.replyToken, `📋 เลือกงานที่จะปิดได้ที่ลิงก์นี้ค่ะ\n${liffUrl}`);
    }
    return;
  }
}
