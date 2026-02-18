import { lineAdapter } from '../adapters/line.adapter.js';
import { complaintService } from '../services/complaint.service.js';
import { officerService } from '../services/officer.service.js';
import { notificationService } from '../services/notification.service.js';
import { tokenService } from '../services/token.service.js';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { env } from '../config/env.js';
import type { UnifiedMessage, DepartmentCode } from '../types/index.js';

// สร้าง Flex Message เมนู — ปุ่มเป็น URI เปิดลิงก์เลย
function mainMenuFlex(urls: {
  register: string;
  accept: string | null;
  dispatch: string | null;
  close: string | null;
  dashboard: string | null;
  dashboardExec: string | null;
  officerName?: string;
}) {
  const buttons: any[] = [
    {
      type: 'button',
      style: 'primary',
      color: '#43A047',
      height: 'sm',
      action: { type: 'uri', label: '📝 ลงทะเบียน', uri: urls.register },
    },
  ];

  if (urls.accept) {
    buttons.push({
      type: 'button',
      style: 'primary',
      color: '#FB8C00',
      height: 'sm',
      action: { type: 'uri', label: '📋 รับงาน', uri: urls.accept },
    });
  }

  if (urls.dispatch) {
    buttons.push({
      type: 'button',
      style: 'primary',
      color: '#1E88E5',
      height: 'sm',
      action: { type: 'uri', label: '🚗 ออกปฏิบัติงาน', uri: urls.dispatch },
    });
  }

  if (urls.close) {
    buttons.push({
      type: 'button',
      style: 'primary',
      color: '#E53935',
      height: 'sm',
      action: { type: 'uri', label: '✅ ปิดงาน', uri: urls.close },
    });
  }

  if (urls.dashboard) {
    buttons.push({
      type: 'button',
      style: 'primary',
      color: '#7B1FA2',
      height: 'sm',
      action: { type: 'uri', label: '📊 แดชบอร์ด', uri: urls.dashboard },
    });
  }

  if (urls.dashboardExec) {
    buttons.push({
      type: 'button',
      style: 'primary',
      color: '#283593',
      height: 'sm',
      action: { type: 'uri', label: '📈 ภาพรวมผู้บริหาร', uri: urls.dashboardExec },
    });
  }

  // ถ้ายังไม่ลงทะเบียน แสดงข้อความ
  if (!urls.accept) {
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
      const acceptUrl = `${env.baseUrl}/liff/accept.html?ref=${complaintRefId}&uid=${msg.senderId}`;
      if (msg.replyToken) {
        await lineAdapter.replyText(msg.replyToken, `📋 กรุณากรอกรายละเอียดรับเรื่องที่ลิงก์นี้ค่ะ\n${acceptUrl}`);
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
      const profile = await lineAdapter.getGroupMemberProfile(msg.chatId, msg.senderId);
      const displayName = profile?.displayName || '';
      const officer = await officerService.getByLineUserId(msg.senderId);

      // สร้าง token เฉพาะคนนี้ (หมดอายุ 30 นาที)
      const token = tokenService.generate(msg.senderId, officer?.id);

      const registerUrl = `${env.baseUrl}/liff/register.html?t=${token}`;

      let acceptUrl: string | null = null;
      let dispatchUrl: string | null = null;
      let closeUrl: string | null = null;

      let dashboardUrl: string | null = null;
      let dashboardExecUrl: string | null = null;

      if (officer) {
        acceptUrl = `${env.baseUrl}/liff/accept-list.html?t=${token}`;
        dispatchUrl = `${env.baseUrl}/liff/dispatch.html?t=${token}`;
        closeUrl = `${env.baseUrl}/liff/close-task.html?t=${token}`;
        dashboardUrl = `${env.baseUrl}/liff/dashboard.html?t=${token}`;

        // ผู้บริหาร: ถ้าไม่ได้ตั้ง ADMIN_LINE_USER_IDS ให้ทุกคนเข้าได้
        const adminIds = (process.env.ADMIN_LINE_USER_IDS || '').split(',').filter(Boolean);
        if (adminIds.length === 0 || adminIds.includes(msg.senderId)) {
          dashboardExecUrl = `${env.baseUrl}/liff/dashboard-exec.html?t=${token}`;
        }
      }

      const flex = mainMenuFlex({
        register: registerUrl,
        accept: acceptUrl,
        dispatch: dispatchUrl,
        close: closeUrl,
        dashboard: dashboardUrl,
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
