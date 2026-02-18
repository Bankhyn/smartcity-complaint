import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import { db, schema } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { env } from '../config/env.js';
import type { Platform, UnifiedMessage } from '../types/index.js';
import { userService } from '../services/user.service.js';
import { complaintService } from '../services/complaint.service.js';
import { aiClassifier } from '../services/ai-classifier.service.js';
import { notificationService } from '../services/notification.service.js';
import { imageService } from '../services/image.service.js';

const genAI = new GoogleGenerativeAI(env.googleAiApiKey);
const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });

interface Session {
  messages: { role: 'user' | 'assistant'; content: string }[];
  data: Record<string, any>;
  confirmed: boolean;
}

async function getSession(platformUserId: string, platform: Platform): Promise<Session> {
  const [row] = await db.select().from(schema.conversations)
    .where(and(
      eq(schema.conversations.platformUserId, platformUserId),
      eq(schema.conversations.platform, platform),
    ));

  if (row) {
    const parsed = JSON.parse(row.data);
    return {
      messages: parsed.messages || [],
      data: parsed.data || {},
      confirmed: parsed.confirmed || false,
    };
  }

  await db.insert(schema.conversations).values({
    platformUserId, platform, state: 'active', data: JSON.stringify({ messages: [], data: {}, confirmed: false }),
  });
  return { messages: [], data: {}, confirmed: false };
}

async function saveSession(platformUserId: string, platform: Platform, session: Session) {
  await db.update(schema.conversations)
    .set({
      data: JSON.stringify(session),
      updatedAt: new Date().toISOString(),
    })
    .where(and(
      eq(schema.conversations.platformUserId, platformUserId),
      eq(schema.conversations.platform, platform),
    ));
}

async function resetSession(platformUserId: string, platform: Platform) {
  await saveSession(platformUserId, platform, { messages: [], data: {}, confirmed: false });
}

const SYSTEM_PROMPT = `คุณชื่อ "น้องพลับพลา" เป็นผู้ช่วย AI ของเทศบาลตำบลพลับพลานารายณ์ จังหวัดจันทบุรี

## บทบาท
- รับเรื่องร้องเรียน/ร้องทุกข์จากประชาชน
- สอบถามข้อมูลทั่วไปเกี่ยวกับเทศบาล
- ติดตามสถานะคำร้อง

## วิธีสนทนา
- พูดภาษาไทยเป็นกันเอง สุภาพ ใช้ค่ะ/คะ
- ตอบสั้นกระชับ ไม่เกิน 3 บรรทัด
- ถ้าประชาชนแจ้งปัญหา ให้ค่อยๆ ถามข้อมูลที่ขาดแบบธรรมชาติ ไม่ต้องถามทีเดียวทุกอย่าง
- ถ้าเขาบอกข้อมูลมาหลายอย่างในข้อความเดียว ให้รับทั้งหมดเลย ไม่ต้องถามซ้ำ

## ข้อมูลที่ต้องเก็บให้ครบก่อนสร้างคำร้อง
1. **issue** — ปัญหาอะไร (ต้องมี)
2. **location** — สถานที่/ที่อยู่ (ต้องมี)
3. **contactName** — ชื่อผู้แจ้ง (ต้องมี)
4. **contactPhone** — เบอร์โทร (ต้องมี)
5. **photo** — รูปถ่าย (ถามแต่ไม่บังคับ)

## กฎสำคัญ
- เมื่อได้ข้อมูลครบ 4 ข้อ (issue, location, contactName, contactPhone) → ถามว่ามีรูปถ่ายส่งมาเพิ่มเติมไหม (ไม่บังคับ) แล้วสรุปข้อมูลให้ประชาชนยืนยัน
- ถ้าประชาชนส่งรูปมาแล้ว (photo มีข้อมูล) ไม่ต้องถามรูปซ้ำ
- ถ้าเขาพิมพ์มาว่า "ไฟหน้าบ้านดับ อยู่หมู่ 5 ชื่อสมศรี 089-123-4567" ให้รับทุกข้อมูลเลย ไม่ต้องถามทีละข้อ
- ถ้าประชาชนแค่ทักทาย ให้ทักทายกลับแล้วถามว่ามีอะไรให้ช่วย
- ถ้าถามเรื่องทั่วไป ตอบได้เลย เช่น เบอร์เทศบาล 0-3941-8498

## ตอบเป็น JSON เสมอ:
{"reply": "ข้อความตอบ", "extracted": {"issue": null, "location": null, "contactName": null, "contactPhone": null, "photo": null}, "readyToConfirm": false, "isConfirmed": false, "isTracking": null}

- **extracted**: ใส่เฉพาะข้อมูลที่ได้จากข้อความ ข้อไหนยังไม่ได้ใส่ null
- **readyToConfirm**: true เมื่อได้ข้อมูลครบ 4 ข้อแล้วและกำลังสรุปให้ยืนยัน
- **isConfirmed**: true เมื่อประชาชนพิมพ์ยืนยัน/ตกลง/โอเค/ถูกต้อง/ใช่ เพื่อ**ยืนยันสร้างคำร้อง** (สำคัญมาก: ถ้าคุณเพิ่งสรุปข้อมูลให้ยืนยัน แล้วเขาตอบ "ยืนยัน" "ตกลง" "ถูกต้อง" "โอเค" "ใช่" → ต้องตั้ง isConfirmed=true)
- **isTracking**: ใส่เฉพาะ REF ID รูปแบบ CMP-XXXXXX-XXX เท่านั้น ถ้าประชาชนพิมพ์ REF ID มาถาม (ห้ามใส่ค่าอื่น ถ้าไม่ใช่ REF ID ให้เป็น null)`;

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

// Gemini API call
async function callGemini(session: Session, systemPrompt: string): Promise<string> {
  const chatModel = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: systemPrompt,
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });
  const history = session.messages.slice(0, -1).map(m => ({
    role: m.role === 'assistant' ? 'model' as const : 'user' as const,
    parts: [{ text: m.content }],
  }));
  const lastMessage = session.messages[session.messages.length - 1];
  const chat = chatModel.startChat({ history });
  const result = await chat.sendMessage(lastMessage.content);
  return result.response.text();
}

// Claude Haiku fallback
async function callClaude(session: Session, systemPrompt: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    system: systemPrompt,
    messages: session.messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' as const : 'user' as const, content: m.content })),
  });
  return response.content[0].type === 'text' ? response.content[0].text : '';
}

export async function handleCitizenMessage(msg: UnifiedMessage): Promise<string[]> {
  const session = await getSession(msg.senderId, msg.platform);
  const text = msg.text?.trim() || '';

  // Handle image — ดาวน์โหลดจาก LINE เก็บถาวร
  if (msg.messageType === 'image') {
    try {
      const photoPath = await imageService.downloadLineImage(msg.platformMessageId);
      session.data.photo = photoPath;
    } catch (e) {
      console.error('Failed to download image:', e);
      session.data.photo = 'received';
    }
    session.messages.push({ role: 'user', content: '[ส่งรูปถ่าย]' });
  } else {
    session.messages.push({ role: 'user', content: text });
  }

  // Keep only last 20 messages to stay within context
  if (session.messages.length > 20) {
    session.messages = session.messages.slice(-20);
  }

  // Build context about what we've collected so far
  const collectedInfo = Object.entries(session.data)
    .filter(([_, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');

  const contextNote = collectedInfo
    ? `\n\n[ข้อมูลที่เก็บได้แล้ว: ${collectedInfo}]`
    : '';

  try {
    let aiText = '';

    // ลอง Gemini ก่อน ถ้า fail → fallback Claude Haiku
    try {
      aiText = await callGemini(session, SYSTEM_PROMPT + contextNote);
    } catch (geminiErr: any) {
      console.warn('[CHAT] Gemini failed, falling back to Claude Haiku:', geminiErr?.message?.slice(0, 100));
      aiText = await callClaude(session, SYSTEM_PROMPT + contextNote);
    }

    // Parse JSON response
    let parsed: any;
    try {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { reply: aiText };
    } catch {
      parsed = { reply: aiText };
    }

    const reply = parsed.reply || aiText;

    // Store extracted data
    if (parsed.extracted) {
      for (const [key, value] of Object.entries(parsed.extracted)) {
        if (value && value !== 'null') {
          session.data[key] = value;
        }
      }
    }

    // Handle tracking — เฉพาะ REF ID format CMP-xxx เท่านั้น
    const trackingId = parsed.isTracking;
    if (trackingId && typeof trackingId === 'string' && /^CMP-/i.test(trackingId)) {
      const complaint = await complaintService.getByRefId(trackingId);
      if (complaint) {
        const statusText = getStatusText(complaint.status);
        const trackReply = `📋 คำร้อง ${complaint.refId}\nเรื่อง: ${complaint.issue}\nสถานะ: ${statusText}${complaint.resultNote ? `\nหมายเหตุ: ${complaint.resultNote}` : ''}`;
        session.messages.push({ role: 'assistant', content: trackReply });
        await saveSession(msg.senderId, msg.platform, session);
        return [trackReply];
      } else {
        const notFound = 'ไม่พบคำร้องหมายเลขนี้ค่ะ กรุณาตรวจสอบ REF ID อีกครั้งนะคะ';
        session.messages.push({ role: 'assistant', content: notFound });
        await saveSession(msg.senderId, msg.platform, session);
        return [notFound];
      }
    }

    // Handle confirmed complaint — รวม fallback: ถ้า AI ไม่ตั้ง isConfirmed แต่ข้อมูลครบ + user พิมพ์ยืนยัน
    const confirmWords = /^(ยืนยัน|ตกลง|โอเค|ถูกต้อง|ใช่|ok|yes|confirm)/i;
    const isUserConfirming = parsed.isConfirmed || (session.data.issue && session.data.location && session.data.contactName && session.data.contactPhone && confirmWords.test(text));
    if (isUserConfirming && session.data.issue && session.data.location && session.data.contactName) {
      const result = await createComplaint(msg, session);
      await resetSession(msg.senderId, msg.platform);
      return result;
    }

    session.messages.push({ role: 'assistant', content: reply });
    await saveSession(msg.senderId, msg.platform, session);
    return [reply];

  } catch (e: any) {
    console.error('[CHAT ERROR]', e?.message || e);
    console.error('[CHAT ERROR stack]', e?.stack);
    console.error('[CHAT ERROR] session data:', JSON.stringify(session.data));
    console.error('[CHAT ERROR] messages count:', session.messages.length);
    return ['ขออภัยค่ะ ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งนะคะ 🙏'];
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

  // ส่ง notification แยก try-catch — ถ้าพังก็ไม่กระทบผลลัพธ์ที่แจ้งประชาชน
  try {
    await notificationService.notifyNewComplaint(complaint, dept, user);
  } catch (e) {
    console.error('Notification error (complaint saved OK):', e);
  }

  return [
    `รับเรื่องเรียบร้อยค่ะ ✅\n\n📌 REF ID: ${complaint.refId}\n🏢 ส่งเรื่องไปที่: ${dept.name}\n📊 สถานะ: รอกองรับเรื่อง\n\nสามารถติดตามสถานะได้ โดยพิมพ์ REF ID ได้ตลอดค่ะ 🙏`,
  ];
}
