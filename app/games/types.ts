import type { Tier, Division } from "../lib/types";
import type { Difficulty } from "./questions/types";

export type GameId = string;

export type GameCategory = "logic" | "memory" | "math" | "reaction" | "strategy";

export type MatchMode = "ranked" | "casual" | "both";

export type GameMeta = {
  id: GameId;
  label: string;
  description: string;
  mode: string;
  avgDurationSec: number;
  category: GameCategory;
  icon: string;
  routePath: string;
  defaultDifficulty?: Difficulty;
  matchMode?: MatchMode;
};

export type GamePhase = "intro" | "playing" | "result";

export type MatchResult = "win" | "loss" | "draw";

export type DuelScore = { self: number; opponent: number };

export type PlayerInfo = {
  name: string;
  tier: Tier;
  division: Division;
  isYou?: boolean;
};

export type GameOutcome = {
  gameId: GameId;
  score: DuelScore;
  result: MatchResult;
  durationMs: number;
  rounds: number;
};

export type RewardSummary = {
  lpDelta: number;
  xpGained: number;
  levelUp: boolean;
};
