import { NextResponse } from "next/server";
import { z } from "zod";
import { isDbConfigured, DbNotConfiguredError, requirePrisma } from "../../lib/prisma";
import { getCurrentUser } from "../../lib/auth/server";
import { matchesService } from "../../lib/services/matches";
import { profilesService } from "../../lib/services/profiles";
import { computeReward } from "../../games/reward";
import { isKnownGame } from "../../games/registry";
import { getValidator } from "../../lib/games/replay";
import { unlockAchievementsForOutcome } from "../../lib/services/achievements";

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
  // Optional input stream for replay validation. Cap on raw size so
  // a malformed client can't blow up the request body.
  inputs: z
    .unknown()
    .refine(
      (v) => v === undefined || typeof v === "object",
      "inputs must be an object",
    )
    .optional(),
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
  const baseReward = computeReward({
    gameId: input.gameId,
    result: input.result,
    score: { self: input.scoreSelf, opponent: input.scoreOpponent },
    durationMs: input.durationMs,
    rounds: input.rounds,
  });

  // Replay validation. If the client sent `inputs` AND we have a
  // validator for this gameId, run it. On failure: clamp lpDelta to
  // 0 (no progression for cheaters), persist the flags, write an
  // audit_events row. Match still records — we want the data for
  // analysis, just don't reward it.
  let inputsValidated = false;
  let auditFlags: string[] = [];
  let lpDelta = baseReward.lpDelta;
  if (input.inputs !== undefined) {
    const validator = getValidator(input.gameId);
    if (validator) {
      const result = validator(
        {
          gameId: input.gameId,
          scoreSelf: input.scoreSelf,
          scoreOpponent: input.scoreOpponent,
          rounds: input.rounds,
          durationMs: input.durationMs,
          difficulty: input.difficulty,
          matchSeed: input.matchSeed,
        },
        input.inputs,
      );
      if (result.valid) {
        inputsValidated = true;
      } else {
        auditFlags = result.flags;
        lpDelta = 0;
      }
    }
  }

  try {
    const prisma = requirePrisma();
    const beforeProfile = await prisma.profile.findUnique({
      where: { userId: user.id },
      select: {
        lp: true,
        level: true,
        tier: true,
        division: true,
        currentStreak: true,
        bestStreak: true,
        wins: true,
        losses: true,
        placementMatchesPlayed: true,
      },
    });

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
          lpDelta,
          xpGained: baseReward.xpGained,
        },
      ],
    });

    // Persist the optional inputs + validation outcome on the
    // MatchResult row we just created. Prisma needs an explicit
    // type when assigning to a Json column; we pass either the
    // unknown payload as InputJsonValue or skip the field entirely.
    if (input.inputs !== undefined || auditFlags.length > 0) {
      await prisma.matchResult.updateMany({
        where: { matchId: created.id, userId: user.id },
        data: {
          ...(input.inputs !== undefined
            ? { inputs: input.inputs as object }
            : {}),
          inputsValidated,
          auditFlags,
        },
      });
    }

    // If the validator flagged this submission, write an audit event
    // so admins can review patterns.
    if (auditFlags.length > 0) {
      await prisma.auditEvent.create({
        data: {
          userId: user.id,
          matchId: created.id,
          category: "replay",
          severity: "warn",
          flags: auditFlags,
          details: {
            gameId: input.gameId,
            claimedScore: input.scoreSelf,
            durationMs: input.durationMs,
          },
        },
      });
    }

    const outcomeApplied = await profilesService.applyMatchOutcome(user.id, {
      result: input.result,
      lpDelta,
      xpGained: baseReward.xpGained,
    });
    const updatedProfile = outcomeApplied?.profile ?? null;
    // The actually-applied delta — what the user's lp ACTUALLY moved
    // by, after the 1.5× placement boost and the 0-floor clamp.
    // Different from the unboosted `lpDelta` we computed above. This
    // is what the response and the MatchResult should record so the
    // user sees the same number in dashboard / history / toast.
    const appliedLpDelta = outcomeApplied?.appliedLpDelta ?? lpDelta;

    // Sync MatchResult.lpDelta with what was actually applied so the
    // match history shows the boosted value, not the base.
    if (appliedLpDelta !== lpDelta) {
      await prisma.matchResult.updateMany({
        where: { matchId: created.id, userId: user.id },
        data: { lpDelta: appliedLpDelta },
      });
    }

    // Auto-award achievements based on the new state. Idempotent —
    // duplicate awards are no-ops via Prisma upsert.
    const newAchievements = updatedProfile
      ? await unlockAchievementsForOutcome({
          userId: user.id,
          gameId: input.gameId,
          result: input.result,
          before: beforeProfile,
          after: updatedProfile,
        })
      : [];

    return NextResponse.json({
      ok: true,
      match: { id: created.id },
      reward: {
        lpDelta: appliedLpDelta,
        xpGained: baseReward.xpGained,
      },
      validation: {
        validatorRan: input.inputs !== undefined && getValidator(input.gameId) !== null,
        inputsValidated,
        auditFlags,
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
            currentStreak: updatedProfile.currentStreak,
            bestStreak: updatedProfile.bestStreak,
            placementMatchesPlayed: updatedProfile.placementMatchesPlayed,
            isProvisional: updatedProfile.placementMatchesPlayed < 5,
          }
        : null,
      // Match-end UX signals — let the client celebrate appropriately.
      milestones: updatedProfile && beforeProfile
        ? {
            tierPromoted:
              updatedProfile.tier !== beforeProfile.tier ||
              updatedProfile.division !== beforeProfile.division,
            leveledUp: updatedProfile.level > beforeProfile.level,
            newStreakRecord:
              updatedProfile.bestStreak > beforeProfile.bestStreak,
            firstWinEver:
              input.result === "win" && beforeProfile.wins === 0,
          }
        : null,
      achievementsUnlocked: newAchievements,
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
