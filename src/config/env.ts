import 'dotenv/config';

export const env = {
  port: parseInt(process.env.PORT || '3100'),

  // LINE
  lineChannelSecret: process.env.LINE_CHANNEL_SECRET || '',
  lineChannelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  liffId: process.env.LIFF_ID || '',

  // Facebook
  fbPageAccessToken: process.env.FB_PAGE_ACCESS_TOKEN || '',
  fbVerifyToken: process.env.FB_VERIFY_TOKEN || 'smartcity_verify_2024',
  fbAppSecret: process.env.FB_APP_SECRET || '',

  // AI
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',

  // LINE Group IDs per department
  lineGroups: {
    secretary: process.env.LINE_GROUP_SECRETARY || '',
    finance: process.env.LINE_GROUP_FINANCE || '',
    engineering: process.env.LINE_GROUP_ENGINEERING || '',
    health: process.env.LINE_GROUP_HEALTH || '',
    education: process.env.LINE_GROUP_EDUCATION || '',
    strategy: process.env.LINE_GROUP_STRATEGY || '',
  } as Record<string, string>,
} as const;
