import { NextResponse } from "next/server";
import { requirePrisma, isDbConfigured } from "../../../../lib/prisma";
import { requireAdmin, AdminUnauthorized } from "../../../../lib/auth/admin";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AdminUnauthorized) {
      return NextResponse.json({ ok: false, reason: err.message }, { status: 401 });
    }
    throw err;
  }
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, reason: "Backend not configured." }, { status: 503 });
  }
  const { id } = await context.params;
  const prisma = requirePrisma();

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      profile: true,
      _count: { select: { matchResults: true, auditEvents: true } },
    },
  });
  if (!user) {
    return NextResponse.json({ ok: false, reason: "Not found." }, { status: 404 });
  }

  // Recent activity — keep responses small. Bigger drill-ins are
  // separate endpoints (/api/admin/audit, /api/admin/matches).
  const [recentAudit, recentMatches] = await Promise.all([
    prisma.auditEvent.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.matchResult.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { match: { select: { gameId: true, durationMs: true } } },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
      bannedAt: user.bannedAt?.toISOString() ?? null,
      banReason: user.banReason,
      bannedBy: user.bannedBy,
      profile: user.profile,
      counts: user._count,
    },
    recentAudit: recentAudit.map((e) => ({
      id: e.id,
      matchId: e.matchId,
      category: e.category,
      severity: e.severity,
      flags: e.flags,
      details: e.details,
      createdAt: e.createdAt.toISOString(),
    })),
    recentMatches: recentMatches.map((m) => ({
      id: m.id,
      matchId: m.matchId,
      gameId: m.match.gameId,
      result: m.result,
      scoreSelf: m.scoreSelf,
      scoreOpponent: m.scoreOpponent,
      lpDelta: m.lpDelta,
      xpGained: m.xpGained,
      durationMs: m.match.durationMs,
      opponentName: m.opponentName,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}
