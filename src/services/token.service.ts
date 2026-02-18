import { randomBytes } from 'crypto';

interface TokenData {
  lineUserId: string;
  officerId?: number;
  createdAt: number;
}

// เก็บ token ใน memory — หมดอายุ 30 นาที
const tokens = new Map<string, TokenData>();
const TTL = 30 * 60 * 1000; // 30 minutes

// ลบ token หมดอายุทุก 5 นาที
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of tokens) {
    if (now - val.createdAt > TTL) tokens.delete(key);
  }
}, 5 * 60 * 1000);

export const tokenService = {
  generate(lineUserId: string, officerId?: number): string {
    const token = randomBytes(16).toString('hex');
    tokens.set(token, { lineUserId, officerId, createdAt: Date.now() });
    return token;
  },

  verify(token: string): TokenData | null {
    const data = tokens.get(token);
    if (!data) return null;
    if (Date.now() - data.createdAt > TTL) {
      tokens.delete(token);
      return null;
    }
    return data;
  },
};
