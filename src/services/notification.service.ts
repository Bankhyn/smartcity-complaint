import { env } from '../config/env.js';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { complaintCardFlex, complaintNotifyFlex, departmentSelectFlex, resultNotifyFlex, dispatchNotifyFlex, acceptNotifyFlex, surveyRequestFlex } from '../flex-messages/complaint-card.js';
import { lineAdapter } from '../adapters/line.adapter.js';
import { facebookAdapter } from '../adapters/facebook.adapter.js';
import { imageService } from './image.service.js';

export const notificationService = {
  async notifyNewComplaint(complaint: any, department: any, user: any) {
    const secretaryGroupId = env.lineGroups.secretary;
    if (secretaryGroupId) {
      const notifyFlex = complaintNotifyFlex(complaint, department.name);
      await lineAdapter.pushFlexMessage(secretaryGroupId, notifyFlex);
    }

    const deptGroupId = env.lineGroups[department.code];
    if (deptGroupId) {
      // แปลง photoUrl เป็น full URL สำหรับ Flex Message
      const complaintWithFullPhoto = {
        ...complaint,
        photoUrl: complaint.photoUrl ? imageService.getFullUrl(complaint.photoUrl) : null,
      };
      const liffUrl = env.liffIdOfficer ? `https://liff.line.me/${env.liffIdOfficer}` : undefined;
      const cardFlex = complaintCardFlex(complaintWithFullPhoto, department.name, complaint.platform, liffUrl);
      await lineAdapter.pushFlexMessage(deptGroupId, cardFlex);
    }
  },

  async notifyTransfer(complaint: any, newDepartment: any, fromDepartmentName: string) {
    const deptGroupId = env.lineGroups[newDepartment.code];
    if (deptGroupId) {
      const complaintWithFullPhoto = {
        ...complaint,
        photoUrl: complaint.photoUrl ? imageService.getFullUrl(complaint.photoUrl) : null,
      };
      const liffUrl = env.liffIdOfficer ? `https://liff.line.me/${env.liffIdOfficer}` : undefined;
      const cardFlex = complaintCardFlex(complaintWithFullPhoto, newDepartment.name, complaint.platform, liffUrl);
      await lineAdapter.pushFlexMessage(deptGroupId, cardFlex);
    }

    const secretaryGroupId = env.lineGroups.secretary;
    if (secretaryGroupId) {
      await lineAdapter.pushText(secretaryGroupId,
        `🔄 ${complaint.refId} โอนจาก${fromDepartmentName} → ${newDepartment.name}`);
    }
  },

  async sendDepartmentSelect(groupId: string, complaintRefId: string) {
    const departments = await db.select().from(schema.departments);
    const deptList = departments.map(d => ({ code: d.code, name: d.name }));
    const flex = departmentSelectFlex(complaintRefId, deptList);
    await lineAdapter.pushFlexMessage(groupId, flex);
  },

  async notifyAccepted(complaint: any) {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, complaint.userId));
    if (!user) return;

    // ดึงชื่อกอง
    let departmentName = 'เทศบาลพลับพลานารายณ์';
    if (complaint.departmentId) {
      const [dept] = await db.select().from(schema.departments).where(eq(schema.departments.id, complaint.departmentId));
      if (dept) departmentName = dept.name;
    }

    if (user.lineUserId) {
      const flex = acceptNotifyFlex(complaint, departmentName);
      await lineAdapter.pushFlexMessage(user.lineUserId, flex);
    } else if (user.facebookPsid) {
      await facebookAdapter.sendText(user.facebookPsid,
        `🔔 แจ้งเตือนจากเทศบาลพลับพลานารายณ์\n\nคำร้อง: ${complaint.refId}\nเรื่อง: ${complaint.issue}\n\n✅ เจ้าหน้าที่รับเรื่องแล้วค่ะ\nกอง: ${departmentName}\n\nเราจะแจ้งความคืบหน้าให้ทราบอีกครั้งนะคะ 🙏`);
    }
  },

  async notifyDispatch(complaint: any, officer: any) {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, complaint.userId));
    if (!user) return;

    if (user.lineUserId) {
      const flex = dispatchNotifyFlex(complaint, officer.name, officer.phone);
      await lineAdapter.pushFlexMessage(user.lineUserId, flex);
    } else if (user.facebookPsid) {
      await facebookAdapter.sendText(user.facebookPsid,
        `🔔 แจ้งเตือนจากเทศบาลพลับพลานารายณ์\n\nคำร้อง: ${complaint.refId}\nเรื่อง: ${complaint.issue}\n\n✅ เจ้าหน้าที่กำลังออกปฏิบัติงานแล้วค่ะ\n👷 ช่าง${officer.name}\n📞 ${officer.phone}\n\nหากมีสายโทรเข้าจากเบอร์นี้ กรุณารับสายด้วยนะคะ 🙏`);
    }
  },

  async notifyResult(complaint: any) {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, complaint.userId));
    if (!user) return;

    // แปลง resultPhotoUrl เป็น full URL
    const complaintWithFullPhoto = {
      ...complaint,
      resultPhotoUrl: complaint.resultPhotoUrl ? imageService.getFullUrl(complaint.resultPhotoUrl) : null,
    };

    if (user.lineUserId) {
      const flex = resultNotifyFlex(complaintWithFullPhoto);
      await lineAdapter.pushFlexMessage(user.lineUserId, flex);
    } else if (user.facebookPsid) {
      const statusText = complaint.resultStatus === 'completed' ? '✅ ดำเนินการสำเร็จ'
        : complaint.resultStatus === 'waiting' ? '⏳ รอดำเนินการ' : '❌ ไม่สำเร็จ';
      await facebookAdapter.sendText(user.facebookPsid,
        `📢 ผลดำเนินงาน\nคำร้อง: ${complaint.refId}\nเรื่อง: ${complaint.issue}\n\nสถานะ: ${statusText}${complaint.resultNote ? `\nหมายเหตุ: ${complaint.resultNote}` : ''}`);
    }
  },

  async sendSurvey(complaint: any) {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, complaint.userId));
    if (!user) return;

    const surveyUrl = `${env.baseUrl}/liff/survey.html?id=${complaint.id}`;

    if (user.lineUserId) {
      const flex = surveyRequestFlex(complaint, surveyUrl);
      await lineAdapter.pushFlexMessage(user.lineUserId, flex);
    } else if (user.facebookPsid) {
      await facebookAdapter.sendText(user.facebookPsid,
        `⭐ ขอให้คะแนนความพึงพอใจ\nคำร้อง: ${complaint.refId}\n\nกรุณาให้คะแนนที่ลิงก์นี้:\n${surveyUrl}`);
    }
  },
};
