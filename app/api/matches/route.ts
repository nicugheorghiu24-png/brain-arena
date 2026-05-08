import { NextResponse } from "next/server";
import { z } from "zod";
import { isDbConfigured, DbNotConfiguredError } from "../../lib/prisma";
import { getCurrentUser } from "../../lib/auth/server";
import { matchesService } from "../../lib/services/matches";
import { profilesService } from "../../lib/services/profiles";
import { computeReward } from "../../games/reward";
import { isKnownGame } from "../../games/registry";

export const runtime = "nodejs";

const DEFAULT_HISTORY_LIMIT = 20;
const MAX_HISTORY_LIMIT = 50;

export async function GET(req: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: true, matches: [] });
  }
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "Not authenticated." },
      { status: 401 },
    );
  }
  const url = new URL(req.url);
  const limitParam = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), MAX_HISTORY_LIMIT)
    : DEFAULT_HISTORY_LIMIT;
  const rows = await matchesService.listForUser(user.id, limit);
  return NextResponse.json({
    ok: true,
    matches: rows.map((r) => ({
      id: r.id,
      gameId: r.match.gameId,
      difficulty: r.match.difficulty,
      rounds: r.match.rounds,
      durationMs: r.match.durationMs,
      playerName: r.playerName,
      opponentName: r.opponentName,
      result: r.result,
      scoreSelf: r.scoreSelf,
      scoreOpponent: r.scoreOpponent,
      lpDelta: r.lpDelta,
      xpGained: r.xpGained,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

// Sanity bounds. The client computes the score, so the server caps each
// dimension to a value that's plausible for the slowest reasonable run
// of any game. Anything outside is clamped (not rejected) — beta is
// closed so we'd rather record a clamped result than 500 a real player.
const MAX_SCORE = 200;
const MAX_ROUNDS = 200;
const MIN_DURATION_MS = 500;
const MAX_DURATION_MS = 15 * 60 * 1000;

const matchInputSchema = z.object({
  gameId: z.string().min(1).max(32),
  difficulty: z.string().min(1).max(32),
  rounds: z.number().int().min(1).max(MAX_ROUNDS),
  durationMs: z.number().int().min(MIN_DURATION_MS).max(MAX_DURATION_MS),
  result: z.enum(["win", "loss", "draw"]),
  scoreSelf: z.number().int().min(0).max(MAX_SCORE),
  scoreOpponent: z.number().int().min(0).max(MAX_SCORE),
  opponentName: z.string().min(1).max(32),
  matchSeed: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
});

export async function POST(req: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { ok: false, reason: "Backend not configured." },
      { status: 503 },
    );
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "Not authenticated." },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, reason: "Invalid JSON." },
      { status: 400 },
    );
  }

  const parsed = matchInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, reason: "Invalid input." },
      { status: 400 },
    );
  }

  const input = parsed.data;
  if (!isKnownGame(input.gameId)) {
    return NextResponse.json(
      { ok: false, reason: "Unknown game." },
      { status: 400 },
    );
  }

  // Server-authoritative reward. The client never sends lpDelta/xpGained;
  // we recompute them from the validated outcome so a tampered client
  // can't inflate progression.
  const reward = computeReward({
    gameId: input.gameId,
    result: input.result,
    score: { self: input.scoreSelf, opponent: input.scoreOpponent },
    durationMs: input.durationMs,
    rounds: input.rounds,
  });

  try {
    const created = await matchesService.record({
      gameId: input.gameId,
      matchSeed: input.matchSeed ?? 0,
      difficulty: input.difficulty,
      rounds: input.rounds,
      durationMs: input.durationMs,
      results: [
        {
          userId: user.id,
          playerName: user.username,
          opponentName: input.opponentName,
          result: input.result,
          scoreSelf: input.scoreSelf,
          scoreOpponent: input.scoreOpponent,
          lpDelta: reward.lpDelta,
          xpGained: reward.xpGained,
        },
      ],
    });

    const updatedProfile = await profilesService.applyMatchOutcome(user.id, {
      result: input.result,
      lpDelta: reward.lpDelta,
      xpGained: reward.xpGained,
    });

    return NextResponse.json({
      ok: true,
      match: { id: created.id },
      reward: {
        lpDelta: reward.lpDelta,
        xpGained: reward.xpGained,
      },
      profile: updatedProfile
        ? {
            lp: updatedProfile.lp,
            xp: updatedProfile.xp,
            level: updatedProfile.level,
            xpToNext: updatedProfile.xpToNext,
            tier: updatedProfile.tier,
            division: updatedProfile.division,
            wins: updatedProfile.wins,
            losses: updatedProfile.losses,
          }
        : null,
    });
  } catch (err) {
    if (err instanceof DbNotConfiguredError) {
      return NextResponse.json(
        { ok: false, reason: "Backend not configured." },
        { status: 503 },
      );
    }
    console.error("[/api/matches] failed:", err);
    return NextResponse.json(
      { ok: false, reason: "Server error." },
      { status: 500 },
    );
  }
}
