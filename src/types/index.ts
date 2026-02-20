// Platform types
export type Platform = 'line' | 'facebook' | 'web';

// Complaint status flow
export type ComplaintStatus =
  | 'pending'           // AI จัดกองแล้ว รอกองรับเรื่อง
  | 'accepted'          // กองรับเรื่องแล้ว
  | 'rejected'          // กองปฏิเสธ (ส่งผิดกอง)
  | 'transferred'       // โอนไปกองใหม่
  | 'dispatched'        // ช่างออกปฏิบัติงานแล้ว
  | 'completed'         // สำเร็จ
  | 'waiting'           // รอดำเนินงาน
  | 'failed';           // ไม่สำเร็จ

// Department codes
export type DepartmentCode =
  | 'secretary'         // สำนักปลัดเทศบาล
  | 'finance'           // กองคลัง
  | 'engineering'       // กองช่าง
  | 'health'            // กองสาธารณสุขฯ
  | 'education'         // กองการศึกษา
  | 'strategy';         // กองยุทธศาสตร์ฯ

// Conversation state for chatbot
export type ConversationState =
  | 'idle'
  | 'greeting'
  | 'ask_issue'
  | 'ask_location'
  | 'ask_photo'
  | 'ask_contact'
  | 'confirm'
  | 'tracking';

// Unified message from LINE or Facebook
export interface UnifiedMessage {
  platform: Platform;
  platformMessageId: string;
  senderId: string;         // LINE userId or FB PSID
  senderName?: string;
  chatType: 'user' | 'group';
  chatId: string;
  messageType: 'text' | 'image' | 'postback' | 'location';
  text?: string;
  postbackData?: string;
  imageUrl?: string;
  latitude?: number;
  longitude?: number;
  timestamp: Date;
  replyToken?: string;      // LINE only
}

// Conversation session for chatbot
export interface ConversationSession {
  userId: string;
  platform: Platform;
  state: ConversationState;
  data: {
    issue?: string;
    location?: string;
    photo?: string;
    contactName?: string;
    contactPhone?: string;
    latitude?: number;
    longitude?: number;
  };
  updatedAt: Date;
}

// AI classification result
export interface ClassificationResult {
  department: DepartmentCode;
  confidence: number;
  summary: string;
  category: string;
}
