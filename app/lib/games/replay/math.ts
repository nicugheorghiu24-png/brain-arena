/**
 * Math sprint validator.
 *
 * Threat model (from ANTI_CHEAT_ARCHITECTURE.md): a tampered client
 * submits a plausible-looking score for a 60-second math sprint
 * without actually solving the problems.
 *
 * Defenses this validator enforces (M1 — bounds + reconciliation):
 *
 *   - per-answer minimum 100ms (faster than this is bot-speed; even
 *     a savant typist needs >150ms to read+answer a math problem)
 *   - per-answer maximum 30s (anything longer is the player walking
 *     away; we count it as no-answer rather than a real attempt)
 *   - the reported scoreSelf must equal the count of inputs whose
 *     `chosenIndex === correctIndex` (no inflating the total
 *     while reporting wrong-then-right answers)
 *   - the answer count must be ≤ rounds (the sprint duration in
 *     seconds; > 1 answer per second is implausible)
 *   - the sum of per-answer ms must not exceed durationMs * 1.1
 *     (10% slack for clock skew between client and server)
 *
 * What this DOES NOT yet defend (M2 work):
 *
 *   - A cheater that submits inputs with fabricated correctIndex.
 *     A true server-deterministic replay would regenerate the same
 *     question set from matchSeed and verify the correctIndex from
 *     the generator's output. Math's current question pipeline
 *     uses fresh client-side seeds per refill batch, which makes
 *     true replay non-trivial. Fix is to switch math to a single
 *     match-bound seed + larger initial batch, then this validator
 *     gains a "regenerate set, verify correctIndex" step.
 */

import type { ValidationContext, ValidationResult } from "./index";

export type MathAnswer = {
  // Hash id of the question (from getQuestionHash). Optional, used
  // for future server-replay; ignored today.
  questionId?: string;
  // The option index the player picked (0..3 for a typical 4-option
  // multiple-choice question).
  chosenIndex: number;
  // The correctIndex the client believed to be correct. M2 will
  // recompute this from the generator and override if they disagree.
  correctIndex: number;
  // Time the player spent on this question in milliseconds.
  ms: number;
};

export type MathInputs = {
  answers: MathAnswer[];
};

const MIN_MS_PER_ANSWER = 100;
const MAX_MS_PER_ANSWER = 30_000;

export function mathValidator(
  ctx: ValidationContext,
  inputsRaw: unknown,
): ValidationResult {
  const flags: string[] = [];

  // Shape check. Anything unexpected → can't validate, flag and bail.
  if (!inputsRaw || typeof inputsRaw !== "object") {
    return { valid: false, flags: ["inputs_invalid_shape"] };
  }
  const inputs = inputsRaw as Partial<MathInputs>;
  if (!Array.isArray(inputs.answers)) {
    return { valid: false, flags: ["inputs_invalid_shape"] };
  }
  const answers = inputs.answers as unknown[];

  // No-answer match. The result is a draw or loss with scoreSelf=0;
  // nothing to validate against, just accept.
  if (answers.length === 0) {
    if (ctx.scoreSelf !== 0) flags.push("score_mismatch_empty_inputs");
    return { valid: flags.length === 0, flags };
  }

  // Cap at one answer per second of sprint duration. ctx.rounds for
  // math is SPRINT_SECONDS (default 60).
  if (answers.length > ctx.rounds) {
    flags.push("too_many_answers");
  }

  let totalMs = 0;
  let countCorrect = 0;
  for (let i = 0; i < answers.length; i++) {
    const a = answers[i] as Partial<MathAnswer>;
    if (
      typeof a !== "object" ||
      a === null ||
      typeof a.chosenIndex !== "number" ||
      typeof a.correctIndex !== "number" ||
      typeof a.ms !== "number"
    ) {
      flags.push("answer_malformed");
      break;
    }
    if (a.ms < MIN_MS_PER_ANSWER) {
      flags.push("answer_too_fast");
      // Don't break — keep accumulating so we know how systemic.
    }
    if (a.ms > MAX_MS_PER_ANSWER) {
      // A pause longer than 30 s is implausible inside a 60 s sprint;
      // record the flag once and clip the value so the time-overflow
      // check below stays meaningful.
      flags.push("answer_too_slow");
    }
    totalMs += Math.min(a.ms, MAX_MS_PER_ANSWER);
    if (a.chosenIndex === a.correctIndex) countCorrect += 1;
  }

  // Time-overflow: 10% slack for clock skew + animation time.
  if (totalMs > ctx.durationMs * 1.1) {
    flags.push("time_overflow");
  }

  // Score reconciliation: client's claimed score must match the
  // count of correct answers in the input stream.
  if (ctx.scoreSelf !== countCorrect) {
    flags.push("score_mismatch");
  }

  // Dedupe flags (e.g. answer_too_fast might fire many times)
  return {
    valid: flags.length === 0,
    flags: Array.from(new Set(flags)),
  };
}
