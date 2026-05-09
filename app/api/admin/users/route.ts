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
    return NextResponse.json({ ok: true, users: [] });
  }
  const url = new URL(req.url);
  const limit = Math.min(
    Math.max(Number.parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 1),
    500,
  );
  const sort = url.searchParams.get("sort") ?? "createdAt"; // createdAt | lp | suspicious

  const prisma = requirePrisma();
  const users = await prisma.user.findMany({
    take: limit,
    orderBy:
      sort === "lp"
        ? { profile: { lp: "desc" } }
        : { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      createdAt: true,
      bannedAt: true,
      banReason: true,
      profile: {
        select: {
          username: true,
          tier: true,
          division: true,
          lp: true,
          wins: true,
          losses: true,
          currentStreak: true,
          bestStreak: true,
          placementMatchesPlayed: true,
          abandonCount: true,
        },
      },
      _count: { select: { auditEvents: true } },
    },
  });

  return NextResponse.json({
    ok: true,
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      createdAt: u.createdAt.toISOString(),
      bannedAt: u.bannedAt?.toISOString() ?? null,
      banReason: u.banReason,
      auditEventCount: u._count.auditEvents,
      profile: u.profile
        ? {
            username: u.profile.username,
            tier: u.profile.tier,
            division: u.profile.division,
            lp: u.profile.lp,
            wins: u.profile.wins,
            losses: u.profile.losses,
            currentStreak: u.profile.currentStreak,
            bestStreak: u.profile.bestStreak,
            placementMatchesPlayed: u.profile.placementMatchesPlayed,
            abandonCount: u.profile.abandonCount,
          }
        : null,
    })),
  });
}
