import express from 'express';
import { resolve } from 'path';
import { env } from './config/env.js';
import { lineWebhook } from './webhooks/line.webhook.js';
import { facebookWebhook } from './webhooks/facebook.webhook.js';
import { tasksApi } from './liff/api/tasks.js';
import { officersApi } from './liff/api/officers.js';
import { seedDepartments } from './db/seed.js';
import { runMigrations } from './db/migrate.js';

const app = express();

// JSON parser (ยกเว้น LINE webhook ที่ต้อง raw body)
app.use((req, res, next) => {
  if (req.path === '/webhook/line') {
    next();
  } else {
    express.json()(req, res, next);
  }
});

// Static files for LIFF
app.use('/liff', express.static(resolve('src/liff/public')));

// Webhooks
app.use(lineWebhook);
app.use(facebookWebhook);

// LIFF APIs
app.use('/api/tasks', tasksApi);
app.use('/api/officers', officersApi);

// Config for LIFF
app.get('/api/config', (_req, res) => {
  res.json({ liffId: env.liffId });
});

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'SmartCity Complaint System',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Home
app.get('/', (_req, res) => {
  res.json({
    name: 'ระบบรับร้องเรียน เทศบาลตำบลพลับพลานารายณ์',
    endpoints: {
      health: '/health',
      lineWebhook: '/webhook/line',
      facebookWebhook: '/webhook/facebook',
      liffRegister: '/liff/register.html',
      liffDispatch: '/liff/dispatch.html',
      liffCloseTask: '/liff/close-task.html',
    },
  });
});

// Migrate + Seed + Start
async function start() {
  await runMigrations();
  await seedDepartments();

  app.listen(env.port, () => {
  console.log('');
  console.log('🏛️  SmartCity Complaint System');
  console.log(`📡 Server running on http://localhost:${env.port}`);
  console.log('');
  console.log('Endpoints:');
  console.log(`  LINE webhook:     /webhook/line`);
  console.log(`  Facebook webhook: /webhook/facebook`);
  console.log(`  LIFF register:    /liff/register.html`);
  console.log(`  LIFF dispatch:    /liff/dispatch.html`);
  console.log(`  LIFF close task:  /liff/close-task.html`);
  console.log(`  Health:           /health`);
  console.log('');
  });
}

start().catch(console.error);
