import { NextResponse } from "next/server";
import { requirePrisma, isDbConfigured } from "../../../lib/prisma";
import { requireAdmin, AdminUnauthorized } from "../../../lib/auth/admin";
import { matchmakingQueue, getIO } from "../../../lib/matchmaking";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AdminUnauthorized) {
      return NextResponse.json({ ok: false, reason: err.message }, { status: 401 });
    }
    throw err;
  }

  // In-process state from the matchmaking singleton — queue depth,
  // active match count, bound socket count.
  const snap = matchmakingQueue.snapshot();
  const io = getIO();
  const connectedSockets = io ? io.engine.clientsCount : 0;

  // DB-backed counters. Kept simple — at beta scale these queries are
  // <50ms total. At M3+ we'd cache or move to a periodic snapshot
  // table.
  let dbCounters: Record<string, unknown> = {};
  if (isDbConfigured()) {
    const prisma = requirePrisma();
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const since1h = new Date(Date.now() - 60 * 60 * 1000);

    const [
      totalUsers,
      bannedUsers,
      activeSessions,
      totalMatches,
      matchesLast24h,
      matchesLast1h,
      tierBreakdown,
      gameBreakdown24h,
      auditEvents24h,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { bannedAt: { not: null } } }),
      prisma.session.count({ where: { expiresAt: { gt: new Date() } } }),
      prisma.match.count(),
      prisma.match.count({ where: { createdAt: { gte: since24h } } }),
      prisma.match.count({ where: { createdAt: { gte: since1h } } }),
      prisma.profile.groupBy({ by: ["tier"], _count: { tier: true } }),
      prisma.match.groupBy({
        by: ["gameId"],
        where: { createdAt: { gte: since24h } },
        _count: { gameId: true },
      }),
      prisma.auditEvent.groupBy({
        by: ["category", "severity"],
        where: { createdAt: { gte: since24h } },
        _count: { category: true },
      }),
    ]);

    dbCounters = {
      totalUsers,
      bannedUsers,
      activeSessions,
      totalMatches,
      matchesLast24h,
      matchesLast1h,
      tierBreakdown: Object.fromEntries(
        tierBreakdown.map((t) => [t.tier, t._count.tier]),
      ),
      gameBreakdown24h: Object.fromEntries(
        gameBreakdown24h.map((g) => [g.gameId, g._count.gameId]),
      ),
      auditEvents24h: auditEvents24h.map((e) => ({
        category: e.category,
        severity: e.severity,
        count: e._count.category,
      })),
    };
  }

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    process: {
      uptimeSec: Math.round(process.uptime()),
      nodeVersion: process.version,
      memory: process.memoryUsage(),
    },
    realtime: {
      connectedSockets,
      ...snap,
    },
    db: dbCounters,
  });
}
