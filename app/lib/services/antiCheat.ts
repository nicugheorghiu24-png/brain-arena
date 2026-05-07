import { requirePrisma } from "../prisma";

export interface MatchResult {
  userId: string;
  score: number;
  timeMs: number;
  answers: number[];
}

export type CheatFlag =
  | "impossible_score"
  | "reaction_anomaly"
  | "macro_pattern"
  | "streak_suspicious";

export const antiCheatService = {
  async analyzeMatchResult(result: MatchResult): Promise<CheatFlag[]> {
    const flags: CheatFlag[] = [];

    // Check for impossible scores
    if (result.score > 100) {
      flags.push("impossible_score");
    }

    // Check reaction times (too fast)
    const avgTime = result.timeMs / result.answers.length;
    if (avgTime < 100) { // Less than 100ms per answer
      flags.push("reaction_anomaly");
    }

    // Check for macro patterns (perfect timing)
    const times = result.answers;
    const uniqueTimes = new Set(times);
    if (uniqueTimes.size === 1 && times.length > 5) {
      flags.push("macro_pattern");
    }

    // Check for suspicious streaks
    const prisma = requirePrisma();
    const recentMatches = await prisma.matchResult.findMany({
      where: { userId: result.userId },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const recentWins = recentMatches.filter(m => m.result === "win").length;
    if (recentWins >= 8) {
      flags.push("streak_suspicious");
    }

    return flags;
  },

  async reportCheat(userId: string, flags: CheatFlag[], matchId: string) {
    const prisma = requirePrisma();
    // Log the cheat attempt
    console.warn(`Cheat detected for user ${userId} in match ${matchId}: ${flags.join(", ")}`);
    // Could ban or flag the user
  },
};