"use client";

import { useEffect, useRef } from "react";

type Options = {
  paused?: boolean;
  resetKey?: string | number;
  accuracy?: number;
  minMs?: number;
  maxMs?: number;
  onAct?: (correct: boolean) => void;
};

/**
 * Schedules a single bot "action" per resetKey. The bot waits a random
 * delay between minMs and maxMs, then calls onAct with a random
 * correct/incorrect outcome weighted by `accuracy`.
 *
 * Pausing cancels the pending action. Changing resetKey cancels the
 * previous one and arms a new action.
 */
export function useOpponentBot({
  paused = false,
  resetKey,
  accuracy = 0.5,
  minMs = 2000,
  maxMs = 7000,
  onAct,
}: Options): void {
  const onActRef = useRef<((correct: boolean) => void) | undefined>(onAct);

  // Keep latest callback without mutating refs during render.
  useEffect(() => {
    onActRef.current = onAct;
  }, [onAct]);

  useEffect(() => {
    if (paused) return;
    const span = Math.max(0, maxMs - minMs);
    const delay = minMs + Math.random() * span;
    const id = setTimeout(() => {
      const correct = Math.random() < accuracy;
      onActRef.current?.(correct);
    }, delay);
    return () => clearTimeout(id);
  }, [paused, resetKey, accuracy, minMs, maxMs]);
}
