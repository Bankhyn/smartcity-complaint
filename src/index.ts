import express from 'express';
import { resolve } from 'path';
import { env } from './config/env.js';
import { lineWebhook } from './webhooks/line.webhook.js';
import { facebookWebhook } from './webhooks/facebook.webhook.js';
import { tasksApi } from './liff/api/tasks.js';
import { officersApi } from './liff/api/officers.js';
import { uploadsApi } from './liff/api/uploads.js';
import { dashboardApi } from './liff/api/dashboard.js';
import { surveyApi } from './liff/api/survey.js';
import { citizenApi } from './liff/api/citizen.js';
import { seedDepartments } from './db/seed.js';
import { runMigrations } from './db/migrate.js';
import { tokenService } from './services/token.service.js';

const app = express();

// JSON parser (ยกเว้น LINE webhook ที่ต้อง raw body)
app.use((req, res, next) => {
  if (req.path === '/webhook/line') {
    next();
  } else {
    express.json({ limit: '10mb' })(req, res, next);
  }
});

// Static files for LIFF
app.use('/liff', express.static(resolve('src/liff/public')));

// Serve uploaded images
app.use('/uploads', express.static(resolve('data/uploads')));

// Webhooks
app.use(lineWebhook);
app.use(facebookWebhook);

// LIFF APIs
app.use('/api/tasks', tasksApi);
app.use('/api/officers', officersApi);
app.use('/api/uploads', uploadsApi);
app.use('/api/dashboard', dashboardApi);
app.use('/api/survey', surveyApi);
app.use('/api/citizen', citizenApi);

// Config for LIFF (public — LIFF IDs are not secret)
app.get('/api/config', (_req, res) => {
  res.json({ liffId: env.liffId, liffIdOfficer: env.liffIdOfficer });
});

// Token verify — หน้าเว็บเรียกเช็คว่า token ถูกต้องไหม
app.get('/api/auth/verify', (req, res) => {
  const token = req.query.token as string;
  if (!token) return res.status(400).json({ error: 'Missing token' });
  const data = tokenService.verify(token);
  if (!data) return res.status(401).json({ error: 'Token ไม่ถูกต้องหรือหมดอายุ กรุณาพิมพ์ /ppnr ใหม่' });
  res.json({ success: true, lineUserId: data.lineUserId, officerId: data.officerId });
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

// Home — redirect to citizen portal
app.get('/', (_req, res) => {
  res.redirect('/liff/citizen.html');
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
  console.log(`  Citizen portal:   /liff/citizen.html`);
  console.log(`  Admin dashboard:  /liff/admin.html`);
  console.log(`  LINE webhook:     /webhook/line`);
  console.log(`  Facebook webhook: /webhook/facebook`);
  console.log(`  Citizen API:      /api/citizen/*`);
  console.log(`  Dashboard API:    /api/dashboard/*`);
  console.log(`  Health:           /health`);
  console.log('');
  });
}

start().catch(console.error);
