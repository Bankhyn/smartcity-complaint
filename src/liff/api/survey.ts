import { Router } from 'express';
import { db, schema } from '../../db/index.js';
import { eq } from 'drizzle-orm';

export const surveyApi = Router();

// ดึงข้อมูลคำร้องสำหรับหน้า survey
surveyApi.get('/info', async (req, res) => {
  const complaintId = parseInt(req.query.id as string);
  if (!complaintId) return res.json({ error: 'ไม่พบข้อมูลคำร้อง' });

  try {
    const [complaint] = await db.select().from(schema.complaints).where(eq(schema.complaints.id, complaintId));
    if (!complaint) return res.json({ error: 'ไม่พบคำร้องนี้' });

    // เช็คว่าให้คะแนนไปแล้วหรือยัง
    const [existing] = await db.select().from(schema.satisfactionRatings)
      .where(eq(schema.satisfactionRatings.complaintId, complaintId));
    if (existing) return res.json({ alreadyRated: true });

    res.json({
      refId: complaint.refId,
      issue: complaint.issue,
      status: complaint.status,
    });
  } catch (e) {
    console.error('[SURVEY] info error:', e);
    res.json({ error: 'เกิดข้อผิดพลาด' });
  }
});

// บันทึกคะแนนความพึงพอใจ
surveyApi.post('/submit', async (req, res) => {
  const { complaintId, systemRating, officerRating, comment } = req.body;

  if (!complaintId || !systemRating || !officerRating) {
    return res.json({ error: 'กรุณาให้คะแนนทั้ง 2 หัวข้อ' });
  }

  if (systemRating < 1 || systemRating > 5 || officerRating < 1 || officerRating > 5) {
    return res.json({ error: 'คะแนนต้องอยู่ระหว่าง 1-5' });
  }

  try {
    // เช็คว่าให้คะแนนไปแล้วหรือยัง
    const [existing] = await db.select().from(schema.satisfactionRatings)
      .where(eq(schema.satisfactionRatings.complaintId, complaintId));
    if (existing) return res.json({ error: 'คำร้องนี้ได้ให้คะแนนไปแล้ว' });

    // เช็คว่า complaint มีจริง
    const [complaint] = await db.select().from(schema.complaints).where(eq(schema.complaints.id, complaintId));
    if (!complaint) return res.json({ error: 'ไม่พบคำร้อง' });

    await db.insert(schema.satisfactionRatings).values({
      complaintId,
      systemRating,
      officerRating,
      comment: comment || null,
    });

    // log
    await db.insert(schema.statusLogs).values({
      complaintId,
      fromStatus: complaint.status,
      toStatus: complaint.status,
      action: 'survey_submitted',
      actorType: 'citizen',
      actorId: String(complaint.userId),
      note: `ระบบ: ${systemRating}/5, เจ้าหน้าที่: ${officerRating}/5`,
      metadata: JSON.stringify({ systemRating, officerRating, comment }),
    });

    console.log(`[SURVEY] ${complaint.refId} → ระบบ:${systemRating} เจ้าหน้าที่:${officerRating}`);
    res.json({ success: true });
  } catch (e) {
    console.error('[SURVEY] submit error:', e);
    res.json({ error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' });
  }
});
