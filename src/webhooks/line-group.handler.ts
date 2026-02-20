import { lineAdapter } from '../adapters/line.adapter.js';
import { complaintService } from '../services/complaint.service.js';
import { officerService } from '../services/officer.service.js';
import { notificationService } from '../services/notification.service.js';
import { tokenService } from '../services/token.service.js';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { env } from '../config/env.js';
import type { UnifiedMessage, DepartmentCode } from '../types/index.js';

// สร้าง Flex Message เมนู — ปุ่มเปิด officer.html (unified app)
function mainMenuFlex(urls: {
  register: string;
  officer: string | null;
  dashboardExec: string | null;
  officerName?: string;
}) {
  const buttons: any[] = [];

  if (urls.officer) {
    buttons.push(
      {
        type: 'button',
        style: 'primary',
        color: '#D97706',
        height: 'sm',
        action: { type: 'uri', label: '📋 เปิดระบบเจ้าหน้าที่', uri: urls.officer },
      },
    );
  }

  buttons.push({
    type: 'button',
    style: urls.officer ? 'secondary' : 'primary',
    color: urls.officer ? undefined : '#43A047',
    height: 'sm',
    action: { type: 'uri', label: '📝 ลงทะเบียน / แก้ไขข้อมูล', uri: urls.register },
  });

  if (urls.dashboardExec) {
    buttons.push({
      type: 'button',
      style: 'primary',
      color: '#283593',
      height: 'sm',
      action: { type: 'uri', label: '📈 ภาพรวมผู้บริหาร', uri: urls.dashboardExec },
    });
  }

  if (!urls.officer) {
    buttons.push({
      type: 'box',
      layout: 'vertical',
      paddingTop: '8px',
      contents: [
        { type: 'text', text: '⚠️ กรุณาลงทะเบียนก่อนใช้งานเมนูอื่น', size: 'xs', color: '#E53935', align: 'center', wrap: true },
      ],
    });
  }

  return {
    type: 'flex' as const,
    altText: '📋 เมนูเจ้าหน้าที่ เทศบาลพลับพลานารายณ์',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#1565C0',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: '🏛️ เทศบาลพลับพลานารายณ์', color: '#ffffff', weight: 'bold', size: 'md' },
          { type: 'text', text: urls.officerName ? `👷 ${urls.officerName}` : 'ระบบจัดการคำร้อง', color: '#B3E5FC', size: 'xs', margin: 'sm' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingAll: '16px',
        contents: buttons,
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '10px',
        contents: [
          { type: 'text', text: 'พิมพ์ /ppnr เพื่อเปิดเมนูนี้อีกครั้ง', size: 'xxs', color: '#aaaaaa', align: 'center' },
        ],
      },
    },
  };
}

export async function handleGroupPostback(msg: UnifiedMessage) {
  const params = new URLSearchParams(msg.postbackData || '');
  const action = params.get('action');
  const complaintRefId = params.get('complaintId');
  if (!complaintRefId) return;

  const complaint = await complaintService.getByRefId(complaintRefId);
  if (!complaint) return;

  switch (action) {
    case 'accept': {
      if (complaint.status !== 'pending') {
        if (msg.replyToken) {
          await lineAdapter.replyText(msg.replyToken, `⚠️ ${complaintRefId} ถูกรับเรื่องไปแล้วค่ะ`);
        }
        break;
      }
      // เปิด LIFF officer.html พร้อม auto-accept (ถ้ามี LIFF ID) หรือ fallback เป็น token URL
      let acceptUrl: string;
      if (env.liffIdOfficer) {
        acceptUrl = `https://liff.line.me/${env.liffIdOfficer}?action=accept&ref=${complaintRefId}`;
      } else {
        const tkn = tokenService.generate(msg.senderId);
        acceptUrl = `${env.baseUrl}/liff/officer.html?t=${tkn}&action=accept&ref=${complaintRefId}`;
      }
      if (msg.replyToken) {
        await lineAdapter.replyText(msg.replyToken, `📋 กดเพื่อรับเรื่องค่ะ\n${acceptUrl}`);
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
  const text = msg.text?.trim().toLowerCase() || '';

  if (text === '/ppnr') {
    try {
      const officer = await officerService.getByLineUserId(msg.senderId);

      // สร้าง token (30 นาที) สำหรับ fallback auth
      const token = tokenService.generate(msg.senderId, officer?.id);

      const registerUrl = `${env.baseUrl}/liff/register.html?t=${token}`;

      // URL หลัก: ถ้ามี LIFF ID → ใช้ LIFF URL, ถ้าไม่มี → ใช้ token URL
      let officerUrl: string | null = null;
      let dashboardExecUrl: string | null = null;

      if (officer) {
        officerUrl = env.liffIdOfficer
          ? `https://liff.line.me/${env.liffIdOfficer}`
          : `${env.baseUrl}/liff/officer.html?t=${token}`;

        // ผู้บริหาร
        const adminIds = (process.env.ADMIN_LINE_USER_IDS || '').split(',').filter(Boolean);
        if (adminIds.length === 0 || adminIds.includes(msg.senderId)) {
          dashboardExecUrl = `${env.baseUrl}/liff/dashboard-exec.html?t=${token}`;
        }
      }

      const flex = mainMenuFlex({
        register: registerUrl,
        officer: officerUrl,
        dashboardExec: dashboardExecUrl,
        officerName: officer?.name,
      });

      if (msg.replyToken) {
        await lineAdapter.replyMessages(msg.replyToken, [flex]);
      }
    } catch (err) {
      console.error('[/ppnr] ERROR:', err);
      if (msg.replyToken) {
        await lineAdapter.replyText(msg.replyToken, '❌ เกิดข้อผิดพลาด กรุณาลองใหม่');
      }
    }
    return;
  }
}
