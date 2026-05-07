import { requirePrisma } from "../prisma";

export type RecordMatchInput = {
  gameId: string;
  matchSeed: number;
  difficulty: string;
  rounds: number;
  durationMs: number;
  results: Array<{
    userId: string;
    playerName: string;
    opponentName: string;
    result: "win" | "loss" | "draw";
    scoreSelf: number;
    scoreOpponent: number;
    lpDelta: number;
    xpGained: number;
  }>;
};

export const matchesService = {
  /**
   * Persist a finished match. The Match row holds the SHARED
   * deterministic fields (seed, difficulty, rounds, duration); each
   * MatchResult row is one participant's outcome. Today there is one
   * result per match (solo vs bot); real PvP would insert two rows
   * pointing at the same Match.
   */
  async record(input: RecordMatchInput) {
    const prisma = requirePrisma();
    return prisma.match.create({
      data: {
        gameId: input.gameId,
        matchSeed: BigInt(input.matchSeed),
        difficulty: input.difficulty,
        rounds: input.rounds,
        durationMs: input.durationMs,
        results: {
          create: input.results.map((r) => ({
            userId: r.userId,
            playerName: r.playerName,
            opponentName: r.opponentName,
            result: r.result,
            scoreSelf: r.scoreSelf,
            scoreOpponent: r.scoreOpponent,
            lpDelta: r.lpDelta,
            xpGained: r.xpGained,
          })),
        },
      },
      include: { results: true },
    });
  },

  async listForUser(userId: string, limit = 20) {
    const prisma = requirePrisma();
    return prisma.matchResult.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { match: true },
    });
  },
};
