"use client";

import { useCallback, useState } from "react";
import type { DuelScore, MatchResult } from "../types";

export type DuelScoreApi = {
  score: DuelScore;
  result: MatchResult;
  scoreSelf: (amount?: number) => void;
  scoreOpponent: (amount?: number) => void;
  reset: () => void;
};

export function useDuelScore(): DuelScoreApi {
  const [score, setScore] = useState<DuelScore>({ self: 0, opponent: 0 });

  const scoreSelf = useCallback((amount = 1) => {
    setScore((s) => ({ ...s, self: s.self + amount }));
  }, []);

  const scoreOpponent = useCallback((amount = 1) => {
    setScore((s) => ({ ...s, opponent: s.opponent + amount }));
  }, []);

  const reset = useCallback(() => {
    setScore({ self: 0, opponent: 0 });
  }, []);

  const result: MatchResult =
    score.self > score.opponent
      ? "win"
      : score.self < score.opponent
        ? "loss"
        : "draw";

  return { score, result, scoreSelf, scoreOpponent, reset };
}
