import { db, schema } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import type { Platform, ConversationState, UnifiedMessage } from '../types/index.js';
import { userService } from '../services/user.service.js';
import { complaintService } from '../services/complaint.service.js';
import { aiClassifier } from '../services/ai-classifier.service.js';
import { notificationService } from '../services/notification.service.js';

interface Session {
  state: ConversationState;
  data: Record<string, any>;
}

async function getSession(platformUserId: string, platform: Platform): Promise<Session> {
  const [row] = await db.select().from(schema.conversations)
    .where(and(
      eq(schema.conversations.platformUserId, platformUserId),
      eq(schema.conversations.platform, platform),
    ));

  if (row) return { state: row.state as ConversationState, data: JSON.parse(row.data) };

  await db.insert(schema.conversations).values({
    platformUserId, platform, state: 'idle', data: '{}',
  });
  return { state: 'idle', data: {} };
}

async function saveSession(platformUserId: string, platform: Platform, session: Session) {
  await db.update(schema.conversations)
    .set({ state: session.state, data: JSON.stringify(session.data), updatedAt: new Date().toISOString() })
    .where(and(
      eq(schema.conversations.platformUserId, platformUserId),
      eq(schema.conversations.platform, platform),
    ));
}

async function resetSession(platformUserId: string, platform: Platform) {
  await saveSession(platformUserId, platform, { state: 'idle', data: {} });
}

function isTracking(text: string): boolean {
  return text.includes('ติดตาม') || text.toUpperCase().startsWith('CMP-');
}

function getStatusText(status: string): string {
  const map: Record<string, string> = {
    pending: '⏳ รอกองรับเรื่อง',
    accepted: '📋 กองรับเรื่องแล้ว',
    transferred: '🔄 โอนกองใหม่',
    dispatched: '🚗 เจ้าหน้าที่ออกปฏิบัติงาน',
    completed: '✅ ดำเนินการสำเร็จ',
    waiting: '⏳ รอดำเนินการ',
    failed: '❌ ไม่สำเร็จ',
  };
  return map[status] || status;
}

export async function handleCitizenMessage(msg: UnifiedMessage): Promise<string[]> {
  const session = await getSession(msg.senderId, msg.platform);
  const text = msg.text?.trim() || '';

  // Handle image in ask_photo state
  if (msg.messageType === 'image' && session.state === 'ask_photo') {
    session.data.photo = msg.imageUrl || 'received';
    session.state = 'ask_contact';
    await saveSession(msg.senderId, msg.platform, session);
    return ['ได้รับรูปแล้วค่ะ 📷\n\nขอชื่อ-นามสกุล และเบอร์โทรติดต่อด้วยนะคะ\n(เช่น สมศรี มีสุข 089-xxx-xxxx)'];
  }

  switch (session.state) {
    case 'idle': {
      if (isTracking(text)) {
        const refId = text.toUpperCase().match(/CMP-\d{8}-\d{4}/)?.[0];
        if (refId) {
          const complaint = await complaintService.getByRefId(refId);
          if (complaint) {
            return [`📋 คำร้อง ${refId}\nเรื่อง: ${complaint.issue}\nสถานะ: ${getStatusText(complaint.status)}${complaint.resultNote ? `\nหมายเหตุ: ${complaint.resultNote}` : ''}`];
          }
          return ['ไม่พบคำร้องหมายเลขนี้ค่ะ กรุณาตรวจสอบ REF ID อีกครั้งนะคะ'];
        }
        session.state = 'tracking';
        await saveSession(msg.senderId, msg.platform, session);
        return ['กรุณาพิมพ์หมายเลข REF ID ที่ได้รับค่ะ (เช่น CMP-20260218-1234)'];
      }

      session.state = 'greeting';
      await saveSession(msg.senderId, msg.platform, session);
      return [
        `สวัสดีค่ะ 🙏 ยินดีต้อนรับสู่ระบบรับเรื่องร้องเรียน\nเทศบาลตำบลพลับพลานารายณ์\n\nมีอะไรให้ช่วยเหลือคะ?\n\n1️⃣ แจ้งเรื่องร้องเรียน/ร้องทุกข์\n2️⃣ สอบถามข้อมูล\n3️⃣ ติดตามเรื่องร้องเรียน (ใส่ REF ID)`,
      ];
    }

    case 'greeting': {
      if (text.includes('1') || text.includes('แจ้ง') || text.includes('ร้องเรียน') || text.includes('ร้องทุกข์')) {
        session.state = 'ask_issue';
        await saveSession(msg.senderId, msg.platform, session);
        return ['กรุณาอธิบายปัญหาที่พบค่ะ\n(เช่น ไฟทางดับ, ถนนพัง, ขยะไม่เก็บ, ท่อน้ำแตก)'];
      }
      if (text.includes('3') || text.includes('ติดตาม')) {
        session.state = 'tracking';
        await saveSession(msg.senderId, msg.platform, session);
        return ['กรุณาพิมพ์หมายเลข REF ID ที่ได้รับค่ะ (เช่น CMP-20260218-1234)'];
      }
      if (text.includes('2') || text.includes('สอบถาม')) {
        await resetSession(msg.senderId, msg.platform);
        return ['สามารถสอบถามข้อมูลได้ที่\n📞 0-3941-8498\n🏢 เทศบาลตำบลพลับพลานารายณ์\n\nหรือพิมพ์ "สวัสดี" เพื่อเริ่มใหม่ค่ะ'];
      }
      // พิมพ์เรื่องมาเลย → ข้ามไปถามที่อยู่
      session.state = 'ask_location';
      session.data.issue = text;
      await saveSession(msg.senderId, msg.platform, session);
      return ['รับทราบค่ะ 📝\n\n📍 สถานที่เกิดปัญหาอยู่ที่ไหนคะ?\n(เช่น หมู่ 5 ซอย 3, หน้าวัดพลับพลา)'];
    }

    case 'ask_issue': {
      session.data.issue = text;
      session.state = 'ask_location';
      await saveSession(msg.senderId, msg.platform, session);
      return ['รับทราบค่ะ 📝\n\n📍 สถานที่เกิดปัญหาอยู่ที่ไหนคะ?\n(เช่น หมู่ 5 ซอย 3, หน้าวัดพลับพลา)'];
    }

    case 'ask_location': {
      session.data.location = text;
      if (msg.latitude && msg.longitude) {
        session.data.latitude = msg.latitude;
        session.data.longitude = msg.longitude;
      }
      session.state = 'ask_photo';
      await saveSession(msg.senderId, msg.platform, session);
      return ['📷 มีรูปถ่ายประกอบไหมคะ?\n\nส่งรูปได้เลย หรือพิมพ์ "ไม่มี" ค่ะ'];
    }

    case 'ask_photo': {
      session.data.photo = (text.includes('ไม่มี') || text.includes('ไม่')) ? null : (msg.imageUrl || null);
      session.state = 'ask_contact';
      await saveSession(msg.senderId, msg.platform, session);
      return ['ขอชื่อ-นามสกุล และเบอร์โทรติดต่อด้วยนะคะ\n(เช่น สมศรี มีสุข 089-123-4567)'];
    }

    case 'ask_contact': {
      const phoneMatch = text.match(/(\d{2,3}[-.]?\d{3}[-.]?\d{4})/);
      session.data.contactName = text.replace(phoneMatch?.[0] || '', '').trim() || text;
      session.data.contactPhone = phoneMatch ? phoneMatch[1] : '';
      session.state = 'confirm';
      await saveSession(msg.senderId, msg.platform, session);

      return [[
        '📋 สรุปคำร้อง:',
        `📌 เรื่อง: ${session.data.issue}`,
        `📍 สถานที่: ${session.data.location}`,
        `👤 ผู้แจ้ง: ${session.data.contactName}`,
        `📞 เบอร์: ${session.data.contactPhone || '-'}`,
        `📷 รูป: ${session.data.photo ? 'มี' : 'ไม่มี'}`,
        '',
        'ข้อมูลถูกต้องไหมคะ?',
        'พิมพ์ "ยืนยัน" หรือ "แก้ไข" ค่ะ',
      ].join('\n')];
    }

    case 'confirm': {
      if (text.includes('ยืนยัน') || text.includes('ถูก') || text.includes('ใช่') || text.includes('ok')) {
        return await createComplaint(msg, session);
      }
      if (text.includes('แก้ไข') || text.includes('แก้') || text.includes('ใหม่')) {
        session.state = 'ask_issue';
        session.data = {};
        await saveSession(msg.senderId, msg.platform, session);
        return ['เริ่มใหม่ค่ะ กรุณาอธิบายปัญหาที่พบค่ะ'];
      }
      return ['กรุณาพิมพ์ "ยืนยัน" หรือ "แก้ไข" ค่ะ'];
    }

    case 'tracking': {
      const refId = text.toUpperCase().match(/CMP-\d{8}-\d{4}/)?.[0] || text.toUpperCase().trim();
      const complaint = await complaintService.getByRefId(refId);
      await resetSession(msg.senderId, msg.platform);

      if (complaint) {
        return [`📋 คำร้อง ${refId}\nเรื่อง: ${complaint.issue}\nสถานะ: ${getStatusText(complaint.status)}${complaint.resultNote ? `\nหมายเหตุ: ${complaint.resultNote}` : ''}\n\nพิมพ์ "สวัสดี" เพื่อเริ่มใหม่ค่ะ`];
      }
      return ['ไม่พบคำร้องหมายเลขนี้ค่ะ กรุณาตรวจสอบ REF ID อีกครั้ง\n\nพิมพ์ "สวัสดี" เพื่อเริ่มใหม่ค่ะ'];
    }

    default:
      await resetSession(msg.senderId, msg.platform);
      return ['เกิดข้อผิดพลาดค่ะ กรุณาพิมพ์ "สวัสดี" เพื่อเริ่มใหม่นะคะ'];
  }
}

async function createComplaint(msg: UnifiedMessage, session: Session): Promise<string[]> {
  const user = await userService.findOrCreate(msg.platform, msg.senderId, session.data.contactName);

  if (session.data.contactPhone) {
    await db.update(schema.users)
      .set({ phone: session.data.contactPhone })
      .where(eq(schema.users.id, user.id));
  }

  const classification = await aiClassifier.classify(session.data.issue);
  const dept = await aiClassifier.getDepartmentByCode(classification.department);

  if (!dept) {
    await resetSession(msg.senderId, msg.platform);
    return ['ขออภัยค่ะ เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้งนะคะ'];
  }

  const complaint = await complaintService.create({
    userId: user.id,
    platform: msg.platform,
    issue: session.data.issue,
    location: session.data.location,
    latitude: session.data.latitude,
    longitude: session.data.longitude,
    photoUrl: session.data.photo,
    contactName: session.data.contactName,
    contactPhone: session.data.contactPhone,
    departmentId: dept.id,
    aiDepartmentId: dept.id,
    aiConfidence: classification.confidence,
    category: classification.category,
    summary: classification.summary,
  });

  await notificationService.notifyNewComplaint(complaint, dept, user);
  await resetSession(msg.senderId, msg.platform);

  return [
    `รับเรื่องเรียบร้อยค่ะ ✅\n\n📌 REF ID: ${complaint.refId}\n🏢 ส่งเรื่องไปที่: ${dept.name}\n📊 สถานะ: รอกองรับเรื่อง\n\nสามารถติดตามสถานะได้ โดยพิมพ์ REF ID ได้ตลอดค่ะ 🙏`,
  ];
}
