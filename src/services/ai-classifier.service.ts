import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import type { ClassificationResult, DepartmentCode } from '../types/index.js';

const genAI = new GoogleGenerativeAI(env.googleAiApiKey);
const geminiModel = genAI.getGenerativeModel({
  model: 'gemini-2.0-flash',
  generationConfig: { responseMimeType: 'application/json' },
});
const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });

async function getCorrections(): Promise<string> {
  const corrections = await db.select().from(schema.aiCorrections);
  if (corrections.length === 0) return '';

  const examples: string[] = [];
  for (const c of corrections.slice(-20)) {
    const [wrongDept] = c.wrongDepartmentId
      ? await db.select().from(schema.departments).where(eq(schema.departments.id, c.wrongDepartmentId))
      : [null];
    const [correctDept] = await db.select().from(schema.departments).where(eq(schema.departments.id, c.correctDepartmentId));
    examples.push(`- "${c.issueText}" → ไม่ใช่ ${wrongDept?.name} → ที่ถูกคือ ${correctDept?.name}`);
  }

  return `\n\n## กรณีที่เคยจัดผิดและแก้ไขแล้ว (เรียนรู้จากสิ่งนี้):\n${examples.join('\n')}`;
}

async function getDepartmentInfo(): Promise<string> {
  const depts = await db.select().from(schema.departments);
  return depts.map(d => {
    const keywords = d.keywords ? JSON.parse(d.keywords).join(', ') : '';
    return `- **${d.name}** (${d.code}): ${d.description}\n  คำที่เกี่ยวข้อง: ${keywords}`;
  }).join('\n');
}

export const aiClassifier = {
  async classify(issueText: string): Promise<ClassificationResult> {
    const departmentInfo = await getDepartmentInfo();
    const corrections = await getCorrections();

    const prompt = `คุณเป็นระบบจัดหมวดหมู่เรื่องร้องเรียนของเทศบาลตำบลพลับพลานารายณ์

## กองที่มี:
${departmentInfo}
${corrections}

## เรื่องร้องเรียน:
"${issueText}"

## ตอบเป็น JSON เท่านั้น:
{"department": "รหัสกอง", "confidence": 0.0-1.0, "summary": "สรุปสั้น", "category": "หมวด"}`;

    try {
      // ลอง Gemini ก่อน
      let text = '';
      try {
        const result = await geminiModel.generateContent(prompt);
        text = result.response.text();
      } catch (geminiErr: any) {
        console.warn('[CLASSIFY] Gemini failed, fallback Claude Haiku:', geminiErr?.message?.slice(0, 100));
        const response = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          messages: [{ role: 'user', content: prompt }],
        });
        text = response.content[0].type === 'text' ? response.content[0].text : '';
      }

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as ClassificationResult;
      }
    } catch (e) {
      console.error('AI classification error:', e);
    }

    return {
      department: 'secretary',
      confidence: 0.3,
      summary: issueText.slice(0, 100),
      category: 'ทั่วไป',
    };
  },

  async getDepartmentByCode(code: DepartmentCode) {
    const [dept] = await db.select().from(schema.departments).where(eq(schema.departments.code, code));
    return dept;
  },
};
