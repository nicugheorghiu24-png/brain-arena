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
  const match = await prisma.match.findUnique({
    where: { id },
    include: { results: true, auditEvents: true },
  });
  if (!match) {
    return NextResponse.json({ ok: false, reason: "Not found." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    match: {
      id: match.id,
      gameId: match.gameId,
      // BigInt → string for JSON. matchSeed is the deterministic
      // generator input; admins may want to recreate the question set.
      matchSeed: match.matchSeed.toString(),
      difficulty: match.difficulty,
      rounds: match.rounds,
      durationMs: match.durationMs,
      createdAt: match.createdAt.toISOString(),
      results: match.results,
      auditEvents: match.auditEvents.map((e) => ({
        id: e.id,
        userId: e.userId,
        category: e.category,
        severity: e.severity,
        flags: e.flags,
        details: e.details,
        createdAt: e.createdAt.toISOString(),
      })),
    },
  });
}
