// Flex Message: แจ้งคำร้องใหม่ไปกลุ่มกอง (พร้อมปุ่มรับ/ปฏิเสธ)
export function complaintCardFlex(complaint: {
  refId: string;
  issue: string;
  category?: string | null;
  location?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  photoUrl?: string | null;
  createdAt: string;
}, departmentName: string, platform: string) {
  return {
    type: 'flex' as const,
    altText: `คำร้องใหม่ ${complaint.refId}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#2196F3',
        paddingAll: '15px',
        contents: [
          { type: 'text', text: '📋 คำร้องใหม่', color: '#ffffff', weight: 'bold', size: 'lg' },
          { type: 'text', text: complaint.refId, color: '#E3F2FD', size: 'sm' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingAll: '15px',
        contents: [
          { type: 'text', text: complaint.issue, weight: 'bold', size: 'md', wrap: true },
          { type: 'separator' },
          infoRow('หมวด', complaint.category || '-'),
          infoRow('สถานที่', complaint.location || '-'),
          infoRow('ผู้แจ้ง', complaint.contactName || '-'),
          infoRow('เบอร์โทร', complaint.contactPhone || '-'),
          infoRow('แจ้งผ่าน', platform === 'line' ? 'LINE' : 'Facebook'),
          infoRow('วันที่', formatDate(complaint.createdAt)),
        ],
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'md',
        paddingAll: '15px',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#4CAF50',
            action: {
              type: 'postback',
              label: '✅ รับเรื่อง',
              displayText: `รับเรื่อง ${complaint.refId}`,
              data: `action=accept&complaintId=${complaint.refId}`,
            },
          },
          {
            type: 'button',
            style: 'primary',
            color: '#F44336',
            action: {
              type: 'postback',
              label: '❌ ไม่ใช่กองนี้',
              displayText: `ปฏิเสธ ${complaint.refId}`,
              data: `action=reject&complaintId=${complaint.refId}`,
            },
          },
        ],
      },
    },
  };
}

// Flex Message: แจ้งเตือนไปสำนักปลัด (แจ้งรับรู้เฉยๆ ไม่มีปุ่ม)
export function complaintNotifyFlex(complaint: {
  refId: string;
  issue: string;
  location?: string | null;
  contactName?: string | null;
}, departmentName: string) {
  return {
    type: 'flex' as const,
    altText: `แจ้งรับรู้คำร้อง ${complaint.refId}`,
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#607D8B',
        paddingAll: '12px',
        contents: [
          { type: 'text', text: '🔔 แจ้งรับรู้คำร้อง', color: '#ffffff', weight: 'bold', size: 'md' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '12px',
        contents: [
          { type: 'text', text: complaint.refId, weight: 'bold', size: 'md', color: '#2196F3' },
          { type: 'text', text: complaint.issue, size: 'sm', wrap: true },
          { type: 'separator' },
          infoRow('สถานที่', complaint.location || '-'),
          infoRow('ผู้แจ้ง', complaint.contactName || '-'),
          infoRow('ส่งไปที่', departmentName),
        ],
      },
    },
  };
}

// Flex Message: เลือกกองที่ถูกต้อง (เมื่อกดปฏิเสธ)
export function departmentSelectFlex(complaintRefId: string, departments: { code: string; name: string }[]) {
  return {
    type: 'flex' as const,
    altText: `เลือกกองที่ถูกต้อง ${complaintRefId}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#FF9800',
        paddingAll: '15px',
        contents: [
          { type: 'text', text: '🔄 เลือกกองที่ถูกต้อง', color: '#ffffff', weight: 'bold', size: 'md' },
          { type: 'text', text: complaintRefId, color: '#FFF3E0', size: 'sm' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '15px',
        contents: departments.map(dept => ({
          type: 'button' as const,
          style: 'secondary' as const,
          margin: 'sm',
          action: {
            type: 'postback' as const,
            label: dept.name.length > 20 ? dept.name.slice(0, 18) + '..' : dept.name,
            displayText: `โอนไป ${dept.name}`,
            data: `action=transfer&complaintId=${complaintRefId}&dept=${dept.code}`,
          },
        })),
      },
    },
  };
}

// Flex Message: แจ้งผลกลับประชาชน
export function resultNotifyFlex(complaint: {
  refId: string;
  issue: string;
  resultStatus?: string | null;
  resultNote?: string | null;
}, officerName?: string, officerPhone?: string) {
  const statusColor = complaint.resultStatus === 'completed' ? '#4CAF50'
    : complaint.resultStatus === 'waiting' ? '#FF9800' : '#F44336';
  const statusText = complaint.resultStatus === 'completed' ? '✅ ดำเนินการสำเร็จ'
    : complaint.resultStatus === 'waiting' ? '⏳ รอดำเนินการ' : '❌ ไม่สำเร็จ';

  return {
    type: 'flex' as const,
    altText: `ผลดำเนินงาน ${complaint.refId}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: statusColor,
        paddingAll: '15px',
        contents: [
          { type: 'text', text: '📢 ผลดำเนินงาน', color: '#ffffff', weight: 'bold', size: 'lg' },
          { type: 'text', text: complaint.refId, color: '#ffffffcc', size: 'sm' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingAll: '15px',
        contents: [
          { type: 'text', text: complaint.issue, weight: 'bold', wrap: true },
          { type: 'separator' },
          { type: 'text', text: statusText, size: 'lg', weight: 'bold', color: statusColor },
          ...(complaint.resultNote ? [{ type: 'text' as const, text: `หมายเหตุ: ${complaint.resultNote}`, size: 'sm' as const, wrap: true, color: '#666666' }] : []),
        ],
      },
    },
  };
}

// Flex Message: แจ้งประชาชนว่าช่างกำลังไป
export function dispatchNotifyFlex(complaint: {
  refId: string;
  issue: string;
}, officerName: string, officerPhone: string) {
  return {
    type: 'flex' as const,
    altText: `เจ้าหน้าที่ออกปฏิบัติงาน ${complaint.refId}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#2196F3',
        paddingAll: '15px',
        contents: [
          { type: 'text', text: '🔔 แจ้งเตือนจากเทศบาล', color: '#ffffff', weight: 'bold', size: 'md' },
          { type: 'text', text: 'พลับพลานารายณ์', color: '#E3F2FD', size: 'sm' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingAll: '15px',
        contents: [
          infoRow('คำร้อง', complaint.refId),
          infoRow('เรื่อง', complaint.issue),
          { type: 'separator' },
          { type: 'text', text: '✅ เจ้าหน้าที่กำลังออกปฏิบัติงานแล้วค่ะ', weight: 'bold', wrap: true, size: 'sm' },
          { type: 'separator' },
          infoRow('👷 ช่าง', officerName),
          infoRow('📞 เบอร์', officerPhone),
          { type: 'text', text: '\nหากมีสายโทรเข้าจากเบอร์นี้ กรุณารับสายด้วยนะคะ 🙏', size: 'xs', wrap: true, color: '#F44336' },
        ],
      },
    },
  };
}

// Helper
function infoRow(label: string, value: string) {
  return {
    type: 'box' as const,
    layout: 'horizontal' as const,
    contents: [
      { type: 'text' as const, text: label, color: '#aaaaaa', flex: 3, size: 'sm' as const },
      { type: 'text' as const, text: value, flex: 5, size: 'sm' as const, wrap: true },
    ],
  };
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
