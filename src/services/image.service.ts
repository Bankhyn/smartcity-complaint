import { messagingApi } from '@line/bot-sdk';
import { env } from '../config/env.js';
import { resolve } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';

const uploadDir = resolve('data/uploads');
mkdirSync(uploadDir, { recursive: true });

const blobClient = new messagingApi.MessagingApiBlobClient({
  channelAccessToken: env.lineChannelAccessToken,
});

export const imageService = {
  /**
   * ดาวน์โหลดรูปจาก LINE Content API แล้วเก็บไว้ใน data/uploads/
   * คืน path สำหรับเข้าถึงรูป เช่น /uploads/abc123.jpg
   */
  async downloadLineImage(messageId: string): Promise<string> {
    const stream = await blobClient.getMessageContent(messageId);

    // อ่าน stream เป็น Buffer
    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    const filename = `${Date.now()}-${randomUUID().slice(0, 8)}.jpg`;
    const filepath = resolve(uploadDir, filename);
    writeFileSync(filepath, buffer);

    return `/uploads/${filename}`;
  },

  /**
   * เก็บรูปจาก base64 (จาก LIFF upload)
   * คืน path สำหรับเข้าถึงรูป
   */
  saveBase64Image(base64Data: string): string {
    // รองรับ data:image/xxx;base64, prefix
    const matches = base64Data.match(/^data:image\/(\w+);base64,(.+)$/);
    const ext = matches ? matches[1] : 'jpg';
    const data = matches ? matches[2] : base64Data;

    const filename = `${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
    const filepath = resolve(uploadDir, filename);
    writeFileSync(filepath, Buffer.from(data, 'base64'));

    return `/uploads/${filename}`;
  },

  /**
   * แปลง relative path เป็น full URL
   */
  getFullUrl(path: string): string {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    // ใช้ Render URL หรือ localhost
    const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${env.port}`;
    return `${baseUrl}${path}`;
  },
};
