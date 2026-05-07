import { generateQuestion } from "./generators";
import { FIXED_POOL } from "./fixed";
import { mulberry32, shuffle } from "./rng";
import { getSeenQuestions, SEEN_FILTER_DAYS } from "./storage";
import type { Difficulty, Question } from "./types";

/**
 * Pure deterministic question set generation.
 *
 * Same (gameId, count, difficulty, seed) → exactly the same Question[]
 * in the same order, on any machine, regardless of who is calling it.
 *
 * FAIRNESS CONTRACT — IMPORTANT
 * In a multiplayer match, every participating client MUST be given the
 * SAME seed (chosen once by the matchmaker / match host) and call this
 * function — never generateFreshQuestionSet, which is per-user.
 * Calling generateFreshQuestionSet from each client would produce
 * different question sets per player and violate the equal-conditions
 * rule that makes Brain Arena 100% skill-based.
 */
export function generateQuestionSet(
  gameId: string,
  count: number,
  difficulty: Difficulty,
  seed: number,
): Question[] {
  const setRng = mulberry32(seed);
  const result: Question[] = [];
  const used = new Set<string>();

  // 1. Try the fixed pool first (deterministically shuffled by seed),
  //    filtered to the requested difficulty.
  const fixedAtDifficulty = (FIXED_POOL[gameId] ?? []).filter(
    (q) => q.difficulty === difficulty,
  );
  const fixedShuffled = shuffle([...fixedAtDifficulty], setRng);
  for (const q of fixedShuffled) {
    if (result.length >= count) break;
    if (used.has(q.id)) continue;
    result.push(q);
    used.add(q.id);
  }

  // 2. Fill the rest by drawing sub-seeds from the same rng stream.
  let attempts = 0;
  const maxAttempts = Math.max(60, count * 20);
  while (result.length < count && attempts < maxAttempts) {
    attempts++;
    const subSeed = Math.floor(setRng() * 0xffffffff) >>> 0;
    const q = generateQuestion(gameId, difficulty, subSeed);
    if (used.has(q.id)) continue;
    result.push(q);
    used.add(q.id);
  }

  return result;
}

/**
 * Same as generateQuestionSet, but also tries to skip questions the
 * given user has seen in the last `days` days (default: 60).
 *
 * Determinism is preserved at the seed-level: same (seed, userId, seenMap)
 * triple → same output. The filter merely advances the deterministic
 * stream further to skip seen questions.
 *
 * USAGE / FAIRNESS — IMPORTANT
 * Call this ONCE per match (e.g., on the host or matchmaker), then
 * BROADCAST the resulting Question[] to all participants. Do NOT call it
 * per-client during the match — that would let two players' seen-history
 * diverge the question set. In Brain Arena's solo-vs-bot mode, the player
 * is the only real participant, so calling it for the player and using
 * the same set for the bot is fair by construction.
 */
export function generateFreshQuestionSet(
  gameId: string,
  count: number,
  difficulty: Difficulty,
  seed: number,
  userId: string | null,
): Question[] {
  const seenMap = getSeenQuestions(userId);
  const cutoff =
    Date.now() - SEEN_FILTER_DAYS * 24 * 60 * 60 * 1000;
  const isRecentlySeen = (id: string) => {
    const t = seenMap[id];
    return t !== undefined && t >= cutoff;
  };

  const setRng = mulberry32(seed);
  const result: Question[] = [];
  const used = new Set<string>();

  // Phase 1 — fixed pool (filtered by difficulty AND not recently seen).
  const fixedAtDifficulty = (FIXED_POOL[gameId] ?? []).filter(
    (q) => q.difficulty === difficulty,
  );
  const fixedShuffled = shuffle([...fixedAtDifficulty], setRng);
  for (const q of fixedShuffled) {
    if (result.length >= count) break;
    if (used.has(q.id)) continue;
    if (isRecentlySeen(q.id)) continue;
    result.push(q);
    used.add(q.id);
  }

  // Phase 2 — procedural, skipping recently-seen.
  let attempts = 0;
  const phase2Max = Math.max(120, count * 40);
  while (result.length < count && attempts < phase2Max) {
    attempts++;
    const subSeed = Math.floor(setRng() * 0xffffffff) >>> 0;
    const q = generateQuestion(gameId, difficulty, subSeed);
    if (used.has(q.id)) continue;
    if (isRecentlySeen(q.id)) continue;
    result.push(q);
    used.add(q.id);
  }

  // Phase 3 — last resort. The 60-day filter is a SOFT preference; we
  // never sacrifice the contract that the match has `count` questions.
  attempts = 0;
  const phase3Max = Math.max(60, count * 20);
  while (result.length < count && attempts < phase3Max) {
    attempts++;
    const subSeed = Math.floor(setRng() * 0xffffffff) >>> 0;
    const q = generateQuestion(gameId, difficulty, subSeed);
    if (used.has(q.id)) continue;
    result.push(q);
    used.add(q.id);
  }

  return result;
}

/**
 * Generate a fresh, non-zero match seed. Use ONCE at match start
 * (host / matchmaker), then share with all participants.
 *
 * SSR-safe: returns 0 when not in a browser (callers should call this
 * inside an effect or event handler).
 */
export function nextMatchSeed(): number {
  if (typeof window === "undefined") return 0;
  return (
    ((Date.now() & 0xffffffff) ^
      Math.floor(Math.random() * 0xffffffff)) >>>
    0
  );
}
