import { NextResponse } from "next/server";
import { requirePrisma, isDbConfigured } from "../../../lib/prisma";
import { requireAdmin, AdminUnauthorized } from "../../../lib/auth/admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AdminUnauthorized) {
      return NextResponse.json({ ok: false, reason: err.message }, { status: 401 });
    }
    throw err;
  }
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: true, matches: [] });
  }

  const url = new URL(req.url);
  const limit = Math.min(
    Math.max(Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1),
    200,
  );
  const gameId = url.searchParams.get("gameId");

  const prisma = requirePrisma();
  const rows = await prisma.match.findMany({
    where: gameId ? { gameId } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      results: {
        select: {
          userId: true,
          playerName: true,
          result: true,
          scoreSelf: true,
          scoreOpponent: true,
          lpDelta: true,
          xpGained: true,
        },
      },
      _count: { select: { auditEvents: true } },
    },
  });

  return NextResponse.json({
    ok: true,
    matches: rows.map((m) => ({
      id: m.id,
      gameId: m.gameId,
      difficulty: m.difficulty,
      durationMs: m.durationMs,
      rounds: m.rounds,
      createdAt: m.createdAt.toISOString(),
      auditEventCount: m._count.auditEvents,
      results: m.results,
    })),
  });
}
