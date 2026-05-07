import type { GameOutcome, RewardSummary } from "./types";

const LP_BASE = { win: 22, draw: 4, loss: -14 } as const;
const XP_BASE = { win: 120, draw: 60, loss: 30 } as const;
const MARGIN_BONUS_LP_PER_POINT = 2;
const MARGIN_BONUS_LP_CAP = 8;

export function computeReward(outcome: GameOutcome): RewardSummary {
  const margin = Math.abs(outcome.score.self - outcome.score.opponent);

  let lpDelta = LP_BASE[outcome.result];
  if (outcome.result === "win") {
    lpDelta += Math.min(margin * MARGIN_BONUS_LP_PER_POINT, MARGIN_BONUS_LP_CAP);
  }

  const xpGained = XP_BASE[outcome.result];

  return { lpDelta, xpGained, levelUp: false };
}
