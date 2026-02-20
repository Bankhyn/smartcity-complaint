import { Router } from 'express';
import { db, schema } from '../../db/index.js';
import { eq, sql, desc, and, gte } from 'drizzle-orm';
import { tokenService } from '../../services/token.service.js';
import { officerService } from '../../services/officer.service.js';
import { env } from '../../config/env.js';

export const dashboardApi = Router();

// Auth middleware — ดึง officer จาก token
async function authDashboard(req: any, res: any, next: any) {
  const token = (req.query.token || '') as string;
  if (!token) return res.status(401).json({ error: 'Missing token' });

  const data = tokenService.verify(token);
  if (!data) return res.status(401).json({ error: 'Token หมดอายุ กรุณาพิมพ์ /ppnr ใหม่' });

  if (!data.officerId) return res.status(403).json({ error: 'กรุณาลงทะเบียนก่อน' });

  const officer = await officerService.getById(data.officerId);
  if (!officer) return res.status(404).json({ error: 'ไม่พบข้อมูลเจ้าหน้าที่' });

  req.officer = officer;
  req.lineUserId = data.lineUserId;
  next();
}

// ========== Dashboard กอง ==========
dashboardApi.get('/department', authDashboard, async (req: any, res) => {
  try {
    const officer = req.officer;
    const deptId = Number(req.query.dept) || officer.departmentId;

    // Department info
    const [dept] = await db.select().from(schema.departments)
      .where(eq(schema.departments.id, deptId));
    if (!dept) return res.status(404).json({ error: 'ไม่พบกอง' });

    // Date filter
    const from = (req.query.from as string) || new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
    const to = (req.query.to as string) || new Date().toISOString().slice(0, 10);

    // All complaints for this department
    const allComplaints = await db.select().from(schema.complaints)
      .where(eq(schema.complaints.departmentId, deptId));

    // Summary counts
    const summary = { total: 0, pending: 0, accepted: 0, dispatched: 0, completed: 0, waiting: 0, failed: 0 };
    for (const c of allComplaints) {
      summary.total++;
      if (c.status in summary) (summary as any)[c.status]++;
    }

    // Performance
    let totalAcceptHours = 0, acceptCount = 0;
    let totalResolveHours = 0, resolveCount = 0;
    for (const c of allComplaints) {
      if (c.acceptedAt && c.createdAt) {
        const h = (new Date(c.acceptedAt).getTime() - new Date(c.createdAt).getTime()) / 3600000;
        if (h >= 0) { totalAcceptHours += h; acceptCount++; }
      }
      if (c.closedAt && c.createdAt) {
        const h = (new Date(c.closedAt).getTime() - new Date(c.createdAt).getTime()) / 3600000;
        if (h >= 0) { totalResolveHours += h; resolveCount++; }
      }
    }
    const totalClosed = summary.completed + summary.waiting + summary.failed;
    const completionRate = totalClosed > 0 ? Math.round((summary.completed / totalClosed) * 100) : 0;

    // Daily counts (last 30 days)
    const dailyMap: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      dailyMap[d] = 0;
    }
    for (const c of allComplaints) {
      const d = c.createdAt.slice(0, 10);
      if (d in dailyMap) dailyMap[d]++;
    }
    const dailyCounts = Object.entries(dailyMap).map(([date, count]) => ({ date, count }));

    // Status breakdown
    const statusBreakdown = Object.entries(summary)
      .filter(([k]) => k !== 'total')
      .map(([status, count]) => ({ status, count }));

    // Category breakdown
    const catMap: Record<string, number> = {};
    for (const c of allComplaints) {
      const cat = c.category || 'ไม่ระบุ';
      catMap[cat] = (catMap[cat] || 0) + 1;
    }
    const categoryBreakdown = Object.entries(catMap)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Officer workload
    const deptOfficers = await db.select().from(schema.officers)
      .where(and(eq(schema.officers.departmentId, deptId), eq(schema.officers.isActive, true)));

    const officerWorkload = deptOfficers.map(o => {
      const assigned = allComplaints.filter(c => c.assignedOfficerId === o.id);
      return {
        officerId: o.id,
        name: o.name,
        position: o.position || '-',
        dispatched: assigned.filter(c => c.status === 'dispatched').length,
        completed: assigned.filter(c => c.status === 'completed').length,
        waiting: assigned.filter(c => c.status === 'waiting').length,
        failed: assigned.filter(c => c.status === 'failed').length,
      };
    });

    // Recent 10
    const recentComplaints = allComplaints.slice(0, 10).map(c => ({
      refId: c.refId,
      issue: c.issue,
      status: c.status,
      category: c.category || '-',
      createdAt: c.createdAt,
      contactName: c.contactName || '-',
    }));

    // Satisfaction ratings สำหรับกองนี้
    const allRatings = await db.select().from(schema.satisfactionRatings);
    const deptComplaintIds = new Set(allComplaints.map(c => c.id));
    const deptRatings = allRatings.filter(r => deptComplaintIds.has(r.complaintId));
    const avgSystem = deptRatings.length > 0
      ? Math.round(deptRatings.reduce((s, r) => s + (r.systemRating || 0), 0) / deptRatings.length * 10) / 10 : null;
    const avgOfficer = deptRatings.length > 0
      ? Math.round(deptRatings.reduce((s, r) => s + (r.officerRating || 0), 0) / deptRatings.length * 10) / 10 : null;

    res.json({
      department: { id: dept.id, code: dept.code, name: dept.name },
      officer: { id: officer.id, name: officer.name, position: officer.position },
      summary,
      performance: {
        avgAcceptTimeHours: acceptCount > 0 ? Math.round(totalAcceptHours / acceptCount * 10) / 10 : null,
        avgResolveTimeHours: resolveCount > 0 ? Math.round(totalResolveHours / resolveCount * 10) / 10 : null,
        completionRate,
      },
      satisfaction: {
        totalResponses: deptRatings.length,
        avgSystemRating: avgSystem,
        avgOfficerRating: avgOfficer,
      },
      dailyCounts,
      statusBreakdown,
      categoryBreakdown,
      officerWorkload,
      recentComplaints,
    });
  } catch (e: any) {
    console.error('[dashboard/department]', e);
    res.status(500).json({ error: e.message });
  }
});

// ========== Dashboard ผู้บริหาร ==========
dashboardApi.get('/executive', authDashboard, async (req: any, res) => {
  try {
    // เช็คสิทธิ์ admin
    const adminIds = (process.env.ADMIN_LINE_USER_IDS || '').split(',').filter(Boolean);
    if (adminIds.length > 0 && !adminIds.includes(req.lineUserId)) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึง Dashboard ผู้บริหาร' });
    }

    const allComplaints = await db.select().from(schema.complaints);
    const allDepts = await db.select().from(schema.departments);
    const allOfficers = await db.select().from(schema.officers);

    const today = new Date().toISOString().slice(0, 10);
    const monthStart = today.slice(0, 7) + '-01';

    // Overall KPIs
    const totalComplaints = allComplaints.length;
    const totalThisMonth = allComplaints.filter(c => c.createdAt >= monthStart).length;
    const totalToday = allComplaints.filter(c => c.createdAt.slice(0, 10) === today).length;
    const closed = allComplaints.filter(c => ['completed', 'waiting', 'failed'].includes(c.status));
    const completed = allComplaints.filter(c => c.status === 'completed');
    const completionRate = closed.length > 0 ? Math.round((completed.length / closed.length) * 100) : 0;

    let totalResolveHours = 0, resolveCount = 0;
    for (const c of allComplaints) {
      if (c.closedAt && c.createdAt) {
        const h = (new Date(c.closedAt).getTime() - new Date(c.createdAt).getTime()) / 3600000;
        if (h >= 0) { totalResolveHours += h; resolveCount++; }
      }
    }

    // Department summary
    const departmentSummary = allDepts.map(d => {
      const deptComplaints = allComplaints.filter(c => c.departmentId === d.id);
      const dClosed = deptComplaints.filter(c => ['completed', 'waiting', 'failed'].includes(c.status));
      const dCompleted = deptComplaints.filter(c => c.status === 'completed');
      return {
        departmentId: d.id,
        departmentCode: d.code,
        departmentName: d.name,
        total: deptComplaints.length,
        pending: deptComplaints.filter(c => c.status === 'pending').length,
        accepted: deptComplaints.filter(c => c.status === 'accepted').length,
        dispatched: deptComplaints.filter(c => c.status === 'dispatched').length,
        completed: dCompleted.length,
        waiting: deptComplaints.filter(c => c.status === 'waiting').length,
        failed: deptComplaints.filter(c => c.status === 'failed').length,
        completionRate: dClosed.length > 0 ? Math.round((dCompleted.length / dClosed.length) * 100) : 0,
        activeOfficers: allOfficers.filter(o => o.departmentId === d.id && o.isActive).length,
      };
    }).sort((a, b) => b.total - a.total);

    // Daily trend (30 days)
    const dailyMap: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      dailyMap[d] = 0;
    }
    for (const c of allComplaints) {
      const d = c.createdAt.slice(0, 10);
      if (d in dailyMap) dailyMap[d]++;
    }
    const dailyTrend = Object.entries(dailyMap).map(([date, count]) => ({ date, count }));

    // Monthly trend (12 months)
    const monthlyMap: Record<string, number> = {};
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const m = d.toISOString().slice(0, 7);
      monthlyMap[m] = 0;
    }
    for (const c of allComplaints) {
      const m = c.createdAt.slice(0, 7);
      if (m in monthlyMap) monthlyMap[m]++;
    }
    const monthlyTrend = Object.entries(monthlyMap).map(([month, count]) => ({ month, count }));

    // Platform breakdown
    const platformMap: Record<string, number> = {};
    for (const c of allComplaints) {
      platformMap[c.platform] = (platformMap[c.platform] || 0) + 1;
    }
    const platformBreakdown = Object.entries(platformMap).map(([platform, count]) => ({ platform, count }));

    // Top categories
    const catMap: Record<string, number> = {};
    for (const c of allComplaints) {
      const cat = c.category || 'ไม่ระบุ';
      catMap[cat] = (catMap[cat] || 0) + 1;
    }
    const topCategories = Object.entries(catMap)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Recent 20
    const recentComplaints = allComplaints.slice(0, 20).map(c => {
      const dept = allDepts.find(d => d.id === c.departmentId);
      return {
        refId: c.refId,
        issue: c.issue,
        status: c.status,
        departmentName: dept?.name || '-',
        createdAt: c.createdAt,
      };
    });

    // Satisfaction ratings ภาพรวม
    const allRatings = await db.select().from(schema.satisfactionRatings);
    const avgSystem = allRatings.length > 0
      ? Math.round(allRatings.reduce((s, r) => s + (r.systemRating || 0), 0) / allRatings.length * 10) / 10 : null;
    const avgOfficer = allRatings.length > 0
      ? Math.round(allRatings.reduce((s, r) => s + (r.officerRating || 0), 0) / allRatings.length * 10) / 10 : null;

    // Satisfaction แยกรายกอง
    const deptSatisfaction = allDepts.map(d => {
      const deptComplaintIds = new Set(allComplaints.filter(c => c.departmentId === d.id).map(c => c.id));
      const deptRatings = allRatings.filter(r => deptComplaintIds.has(r.complaintId));
      return {
        departmentName: d.name,
        responses: deptRatings.length,
        avgSystem: deptRatings.length > 0 ? Math.round(deptRatings.reduce((s, r) => s + (r.systemRating || 0), 0) / deptRatings.length * 10) / 10 : null,
        avgOfficer: deptRatings.length > 0 ? Math.round(deptRatings.reduce((s, r) => s + (r.officerRating || 0), 0) / deptRatings.length * 10) / 10 : null,
      };
    });

    res.json({
      overall: {
        totalComplaints,
        totalThisMonth,
        totalToday,
        completionRate,
        avgResolveTimeHours: resolveCount > 0 ? Math.round(totalResolveHours / resolveCount * 10) / 10 : null,
      },
      satisfaction: {
        totalResponses: allRatings.length,
        avgSystemRating: avgSystem,
        avgOfficerRating: avgOfficer,
        byDepartment: deptSatisfaction,
      },
      departmentSummary,
      dailyTrend,
      monthlyTrend,
      platformBreakdown,
      topCategories,
      recentComplaints,
    });
  } catch (e: any) {
    console.error('[dashboard/executive]', e);
    res.status(500).json({ error: e.message });
  }
});
