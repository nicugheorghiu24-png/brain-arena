import { NextResponse } from "next/server";
import { requirePrisma, isDbConfigured } from "../../../lib/prisma";

export const runtime = "nodejs";

/**
 * Public profile lookup by username.
 *
 * Returns the player-facing fields a public profile page needs.
 * Sensitive fields are intentionally not in the response:
 *
 *   - email                    (private to the user)
 *   - id (the UUID)            (internal, leaks join shape)
 *   - bannedAt / banReason     (moderation only — /api/admin/*)
 *   - sessions / passwordHash  (obviously)
 *   - abandonCount             (in-flight discussion: visible to admin
 *                                but not to other players)
 *
 * No auth required. Profiles are public — same trust posture as a
 * leaderboard rank. Anonymous viewers can see what tier someone is
 * and what they've achieved.
 *
 * Includes a small slice of recent match history (last 12). For a
 * banned user we return 404 — they're effectively delisted, same as
 * leaderboard exclusion. This keeps banned-account stalking quiet.
 */

const HISTORY_LIMIT = 12;

export async function GET(
  _req: Request,
  context: { params: Promise<{ username: string }> },
) {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { ok: false, reason: "Backend not configured." },
      { status: 503 },
    );
  }

  const { username } = await context.params;
  if (!username || typeof username !== "string" || username.length > 32) {
    return NextResponse.json(
      { ok: false, reason: "Invalid username." },
      { status: 400 },
    );
  }

  const prisma = requirePrisma();
  // Profile.username is @unique. Pull the joined user + ban state so
  // we can filter out banned accounts.
  const profile = await prisma.profile.findUnique({
    where: { username },
    include: {
      user: {
        select: {
          id: true,
          bannedAt: true,
          achievements: { select: { achievementId: true, unlockedAt: true } },
        },
      },
    },
  });
  if (!profile || profile.user.bannedAt) {
    return NextResponse.json(
      { ok: false, reason: "Not found." },
      { status: 404 },
    );
  }

  const recentMatches = await prisma.matchResult.findMany({
    where: { userId: profile.user.id },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
    include: {
      match: { select: { gameId: true, difficulty: true, durationMs: true } },
    },
  });

  return NextResponse.json({
    ok: true,
    profile: {
      username: profile.username,
      tier: profile.tier,
      division: profile.division,
      lp: profile.lp,
      level: profile.level,
      xp: profile.xp,
      xpToNext: profile.xpToNext,
      wins: profile.wins,
      losses: profile.losses,
      currentStreak: profile.currentStreak,
      bestStreak: profile.bestStreak,
      placementMatchesPlayed: profile.placementMatchesPlayed,
      isProvisional: profile.placementMatchesPlayed < 5,
      region: profile.region,
      bio: profile.bio,
      joinedAt: profile.joinedAt.toISOString(),
      favoriteGameId: profile.favoriteGameId,
    },
    unlockedAchievements: profile.user.achievements.map((a) => ({
      id: a.achievementId,
      unlockedAt: a.unlockedAt.toISOString(),
    })),
    recentMatches: recentMatches.map((m) => ({
      id: m.id,
      gameId: m.match.gameId,
      difficulty: m.match.difficulty,
      durationMs: m.match.durationMs,
      result: m.result,
      scoreSelf: m.scoreSelf,
      scoreOpponent: m.scoreOpponent,
      opponentName: m.opponentName,
      lpDelta: m.lpDelta,
      xpGained: m.xpGained,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}
