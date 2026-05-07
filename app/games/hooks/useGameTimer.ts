"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const TICK_MS = 200;

type Options = {
  durationSec: number;
  paused?: boolean;
  onTimeout?: () => void;
};

export type GameTimer = {
  timeLeft: number;
  remainingMs: number;
  percent: number;
  expired: boolean;
  reset: (nextDurationSec?: number) => void;
  stop: () => void;
};

export function useGameTimer({
  durationSec,
  paused = false,
  onTimeout,
}: Options): GameTimer {
  const [deadline, setDeadline] = useState<number>(
    () => Date.now() + durationSec * 1000,
  );
  const [now, setNow] = useState<number>(() => Date.now());
  const onTimeoutRef = useRef<(() => void) | undefined>(onTimeout);

  // Keep the latest callback in a ref without mutating during render.
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  // Drive the visible clock — paused means the displayed time freezes.
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [paused]);

  // Schedule a single timeout callback at the deadline. setState only
  // happens inside the setTimeout callback, never synchronously in the
  // effect body.
  useEffect(() => {
    if (paused) return;
    const ms = deadline - Date.now();
    if (ms <= 0) {
      const id = setTimeout(() => onTimeoutRef.current?.(), 0);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => onTimeoutRef.current?.(), ms);
    return () => clearTimeout(id);
  }, [paused, deadline]);

  const reset = useCallback(
    (nextDurationSec?: number) => {
      const sec = nextDurationSec ?? durationSec;
      const next = Date.now() + sec * 1000;
      setDeadline(next);
      setNow(Date.now());
    },
    [durationSec],
  );

  const stop = useCallback(() => {
    setDeadline(Date.now());
  }, []);

  const remainingMs = Math.max(0, deadline - now);
  const totalMs = Math.max(1, durationSec * 1000);
  const percent = Math.max(0, Math.min(100, (remainingMs / totalMs) * 100));
  const timeLeft = Math.ceil(remainingMs / 1000);
  const expired = remainingMs <= 0;

  return { timeLeft, remainingMs, percent, expired, reset, stop };
}
