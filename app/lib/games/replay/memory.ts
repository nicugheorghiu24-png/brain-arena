/**
 * Memory Match validator.
 *
 * Game shape: 16 cards (8 pairs), face-down. The player flips two
 * cards per turn; a match scores 1 and stays revealed, a non-match
 * flips back. Player alternates with the bot until all pairs found.
 *
 * Threat model: a tampered client claims to have found pairs they
 * didn't, or claims an impossibly fast play time. The fastest a human
 * can possibly flip two cards is ~250 ms; faster suggests automation.
 *
 * Defenses:
 *   - Total player turn count ≤ TOTAL_PAIRS * 4 (worst case is
 *     flipping every wrong pair before finding the right one)
 *   - Each turn's ms ≥ 250
 *   - scoreSelf == count of turns where matched===true
 *   - Sum of turn ms ≤ durationMs * 1.1 (10% slack)
 *
 * What this does NOT yet defend (M2 follow-up): a sophisticated
 * cheater that reports realistic timings AND matched=true for every
 * turn. True replay would regenerate the shuffled deck from matchSeed
 * and verify that the two flipped indices actually share a symbol.
 * Memory currently uses Math.random() for shuffling so the seed isn't
 * yet load-bearing.
 */

import type { ValidationContext, ValidationResult } from "./index";

const MIN_MS_PER_TURN = 250;
const MAX_MS_PER_TURN = 30_000;

export type MemoryTurn = {
  // Card slot indices (0..15) the player flipped this turn
  cardA: number;
  cardB: number;
  ms: number;
  matched: boolean;
};

export type MemoryInputs = {
  turns: MemoryTurn[];
};

export function memoryValidator(
  ctx: ValidationContext,
  inputsRaw: unknown,
): ValidationResult {
  const flags: string[] = [];

  if (!inputsRaw || typeof inputsRaw !== "object") {
    return { valid: false, flags: ["inputs_invalid_shape"] };
  }
  const inputs = inputsRaw as Partial<MemoryInputs>;
  if (!Array.isArray(inputs.turns)) {
    return { valid: false, flags: ["inputs_invalid_shape"] };
  }

  const turns = inputs.turns as unknown[];
  if (turns.length === 0) {
    if (ctx.scoreSelf !== 0) flags.push("score_mismatch_empty_inputs");
    return { valid: flags.length === 0, flags };
  }

  // ctx.rounds for memory is TOTAL_PAIRS (8). Worst case is 4x that
  // many turns (every non-matching pair flipped before getting it).
  const maxTurns = ctx.rounds * 4;
  if (turns.length > maxTurns) {
    flags.push("too_many_turns");
  }

  let totalMs = 0;
  let countMatched = 0;
  for (const tRaw of turns) {
    const t = tRaw as Partial<MemoryTurn>;
    if (
      typeof t !== "object" ||
      t === null ||
      typeof t.cardA !== "number" ||
      typeof t.cardB !== "number" ||
      typeof t.ms !== "number" ||
      typeof t.matched !== "boolean"
    ) {
      flags.push("turn_malformed");
      break;
    }
    if (t.cardA === t.cardB) {
      // Same card flipped twice — never happens in normal play.
      flags.push("same_card_twice");
    }
    if (t.ms < MIN_MS_PER_TURN) {
      flags.push("turn_too_fast");
    }
    if (t.ms > MAX_MS_PER_TURN) {
      flags.push("turn_too_slow");
    }
    totalMs += Math.min(t.ms, MAX_MS_PER_TURN);
    if (t.matched) countMatched += 1;
  }

  if (totalMs > ctx.durationMs * 1.1) {
    flags.push("time_overflow");
  }
  if (countMatched > ctx.rounds) {
    // More matches than there are pairs.
    flags.push("more_matches_than_pairs");
  }
  if (ctx.scoreSelf !== countMatched) {
    flags.push("score_mismatch");
  }

  return {
    valid: flags.length === 0,
    flags: Array.from(new Set(flags)),
  };
}
