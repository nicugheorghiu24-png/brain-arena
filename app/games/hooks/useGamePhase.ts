"use client";

import { useCallback, useEffect, useState } from "react";
import type { GamePhase } from "../types";

type Options = {
  introMs?: number;
  initial?: GamePhase;
};

export type GamePhaseApi = {
  phase: GamePhase;
  start: () => void;
  finish: () => void;
  restart: () => void;
};

export function useGamePhase({
  introMs = 900,
  initial = "intro",
}: Options = {}): GamePhaseApi {
  const [phase, setPhase] = useState<GamePhase>(initial);

  // Auto-transition intro → playing. The setState lives inside a
  // setTimeout callback, so it never fires synchronously in the
  // effect body.
  useEffect(() => {
    if (phase !== "intro") return;
    if (introMs <= 0) {
      const id = setTimeout(() => setPhase("playing"), 0);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => setPhase("playing"), introMs);
    return () => clearTimeout(id);
  }, [phase, introMs]);

  const start = useCallback(() => setPhase("playing"), []);
  const finish = useCallback(() => setPhase("result"), []);
  const restart = useCallback(() => setPhase("intro"), []);

  return { phase, start, finish, restart };
}
