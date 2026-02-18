import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// กอง 6 กอง
export const departments = sqliteTable('departments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().unique(),          // secretary, finance, engineering, health, education, strategy
  name: text('name').notNull(),                    // ชื่อภาษาไทย
  description: text('description'),                // รายละเอียดหน้าที่
  lineGroupId: text('line_group_id'),              // LINE Group ID ของกอง
  keywords: text('keywords'),                      // คำที่เกี่ยวข้อง (JSON array) สำหรับ AI เรียนรู้
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// ผู้ใช้ (ประชาชน)
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  lineUserId: text('line_user_id'),
  facebookPsid: text('facebook_psid'),
  displayName: text('display_name'),
  phone: text('phone'),
  pictureUrl: text('picture_url'),
  platform: text('platform').notNull(),            // line | facebook
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// เจ้าหน้าที่
export const officers = sqliteTable('officers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  lineUserId: text('line_user_id').notNull().unique(),
  lineDisplayName: text('line_display_name'),        // ชื่อ LINE (เก็บแยกจากชื่อจริง)
  name: text('name').notNull(),                      // ชื่อ-นามสกุลจริง
  position: text('position'),                        // ตำแหน่ง
  phone: text('phone').notNull(),                    // เบอร์โทร (แจ้งประชาชน)
  departmentId: integer('department_id').notNull().references(() => departments.id),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  registeredAt: text('registered_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// คำร้อง/ร้องเรียน
export const complaints = sqliteTable('complaints', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  refId: text('ref_id').notNull().unique(),        // CMP-YYYYMMDD-XXXX
  userId: integer('user_id').notNull().references(() => users.id),
  platform: text('platform').notNull(),            // line | facebook

  // ข้อมูลคำร้อง
  issue: text('issue').notNull(),                  // เรื่องร้องเรียน
  category: text('category'),                      // หมวด (AI จัด)
  summary: text('summary'),                        // สรุปสั้น (AI สรุป)
  location: text('location'),                      // สถานที่
  latitude: real('latitude'),
  longitude: real('longitude'),
  photoUrl: text('photo_url'),                     // รูปประกอบ
  contactName: text('contact_name'),
  contactPhone: text('contact_phone'),

  // การจัดการ
  departmentId: integer('department_id').references(() => departments.id),
  aiDepartmentId: integer('ai_department_id').references(() => departments.id),  // AI จัดให้กองไหน
  aiConfidence: real('ai_confidence'),
  status: text('status').notNull().default('pending'),

  // การรับเรื่อง
  assignedOfficerId: integer('assigned_officer_id').references(() => officers.id),
  acceptedBy: text('accepted_by'),                  // LINE userId ของหัวหน้ากองที่รับ
  acceptNote: text('accept_note'),                   // หมายเหตุตอนรับเรื่อง
  scheduledDate: text('scheduled_date'),             // วันกำหนดปฏิบัติงาน

  // ผลดำเนินงาน
  resultStatus: text('result_status'),             // completed | waiting | failed
  resultNote: text('result_note'),                 // หมายเหตุ
  resultPhotoUrl: text('result_photo_url'),        // รูปผลงาน

  // timestamps
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  acceptedAt: text('accepted_at'),
  dispatchedAt: text('dispatched_at'),
  closedAt: text('closed_at'),
});

// log ทุก action (สำหรับ analytics)
export const statusLogs = sqliteTable('status_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  complaintId: integer('complaint_id').notNull().references(() => complaints.id),
  fromStatus: text('from_status'),
  toStatus: text('to_status').notNull(),
  action: text('action').notNull(),                // created, accepted, rejected, transferred, dispatched, closed
  actorType: text('actor_type').notNull(),         // system, officer, citizen, ai
  actorId: text('actor_id'),                       // userId or officerId
  note: text('note'),
  metadata: text('metadata'),                      // JSON สำหรับข้อมูลเพิ่มเติม
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// Conversation sessions (chatbot state)
export const conversations = sqliteTable('conversations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  platformUserId: text('platform_user_id').notNull(), // LINE userId or FB PSID
  platform: text('platform').notNull(),
  state: text('state').notNull().default('idle'),
  data: text('data').notNull().default('{}'),        // JSON
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// AI learning: เก็บ correction เพื่อให้ AI เรียนรู้
export const aiCorrections = sqliteTable('ai_corrections', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  complaintId: integer('complaint_id').notNull().references(() => complaints.id),
  issueText: text('issue_text').notNull(),
  wrongDepartmentId: integer('wrong_department_id').references(() => departments.id),
  correctDepartmentId: integer('correct_department_id').notNull().references(() => departments.id),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});
