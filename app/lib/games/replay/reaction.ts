/**
 * Reaction Duel validator.
 *
 * Game shape: fixed 5 rounds. Each round the player sees a stoplight
 * and clicks when it turns green. Their reaction time competes
 * against a bot's. A player who clicks BEFORE the green light
 * registers a "false start" (rt = -1, counts as a round loss).
 *
 * Threat model: a tampered client claims unrealistically fast
 * reaction times. The fastest documented human visual reaction is
 * ~100ms (highly trained sprinters); 50–80ms can be fluky but
 * sub-50ms is implausible without machine assistance. We bound at
 * 80ms to be generous.
 *
 * Defenses:
 *   - Round count must equal ctx.rounds (5 for reaction)
 *   - Each rt is either -1 (false start) or in [80, 1500] ms
 *   - scoreSelf == count of rounds where rt < botRt AND rt >= 80
 */

import type { ValidationContext, ValidationResult } from "./index";

const FALSE_START_RT = -1;
const MIN_HUMAN_RT = 80;
const MAX_RT = 1500; // anything slower is treated as a non-attempt

export type ReactionRound = {
  rt: number; // player's reaction time in ms, or -1 for false start
  botRt: number; // bot's rt, what the player needed to beat
};

export type ReactionInputs = {
  rounds: ReactionRound[];
};

export function reactionValidator(
  ctx: ValidationContext,
  inputsRaw: unknown,
): ValidationResult {
  const flags: string[] = [];

  if (!inputsRaw || typeof inputsRaw !== "object") {
    return { valid: false, flags: ["inputs_invalid_shape"] };
  }
  const inputs = inputsRaw as Partial<ReactionInputs>;
  if (!Array.isArray(inputs.rounds)) {
    return { valid: false, flags: ["inputs_invalid_shape"] };
  }

  const rounds = inputs.rounds as unknown[];
  if (rounds.length !== ctx.rounds) {
    flags.push("round_count_mismatch");
  }

  let countCorrect = 0;
  for (const rRaw of rounds) {
    const r = rRaw as Partial<ReactionRound>;
    if (
      typeof r !== "object" ||
      r === null ||
      typeof r.rt !== "number" ||
      typeof r.botRt !== "number"
    ) {
      flags.push("round_malformed");
      break;
    }
    if (r.rt !== FALSE_START_RT && r.rt < MIN_HUMAN_RT) {
      flags.push("rt_too_fast");
    }
    if (r.rt > MAX_RT) {
      flags.push("rt_too_slow");
    }
    // A round is a win for the player when they didn't false-start
    // AND their rt is below the bot's. Mirrors the rule in the
    // reaction page handler.
    if (r.rt !== FALSE_START_RT && r.rt >= MIN_HUMAN_RT && r.rt < r.botRt) {
      countCorrect += 1;
    }
  }

  if (ctx.scoreSelf !== countCorrect) {
    flags.push("score_mismatch");
  }

  return {
    valid: flags.length === 0,
    flags: Array.from(new Set(flags)),
  };
}
