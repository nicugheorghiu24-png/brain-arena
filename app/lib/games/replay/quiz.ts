/**
 * Logic Quiz (a.k.a. arena/quiz game) validator.
 *
 * Game shape: 5 multiple-choice questions, 12 seconds each. Same
 * answer-stream shape as math sprint but a fixed (small) number of
 * questions, no refill.
 *
 * Defenses inherit from the math model:
 *   - Each answer's ms ≥ 200 (logic questions need read time)
 *   - Each answer's ms ≤ 12_000 (the per-question timer)
 *   - answers.length ≤ ctx.rounds (5)
 *   - scoreSelf == count of inputs where chosenIndex === correctIndex
 *   - Sum of per-answer ms ≤ durationMs * 1.1
 *
 * Logic questions take longer to read than arithmetic so the floor
 * is 200 ms (vs 100 for math).
 */

import type { ValidationContext, ValidationResult } from "./index";

const MIN_MS_PER_ANSWER = 200;
const MAX_MS_PER_ANSWER = 12_000;

export type QuizAnswer = {
  questionId?: string;
  chosenIndex: number;
  correctIndex: number;
  ms: number;
};

export type QuizInputs = {
  answers: QuizAnswer[];
};

export function quizValidator(
  ctx: ValidationContext,
  inputsRaw: unknown,
): ValidationResult {
  const flags: string[] = [];

  if (!inputsRaw || typeof inputsRaw !== "object") {
    return { valid: false, flags: ["inputs_invalid_shape"] };
  }
  const inputs = inputsRaw as Partial<QuizInputs>;
  if (!Array.isArray(inputs.answers)) {
    return { valid: false, flags: ["inputs_invalid_shape"] };
  }

  const answers = inputs.answers as unknown[];
  if (answers.length === 0) {
    if (ctx.scoreSelf !== 0) flags.push("score_mismatch_empty_inputs");
    return { valid: flags.length === 0, flags };
  }
  if (answers.length > ctx.rounds) {
    flags.push("too_many_answers");
  }

  let totalMs = 0;
  let countCorrect = 0;
  for (const aRaw of answers) {
    const a = aRaw as Partial<QuizAnswer>;
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
    }
    if (a.ms > MAX_MS_PER_ANSWER) {
      flags.push("answer_too_slow");
    }
    totalMs += Math.min(a.ms, MAX_MS_PER_ANSWER);
    if (a.chosenIndex === a.correctIndex) countCorrect += 1;
  }

  if (totalMs > ctx.durationMs * 1.1) {
    flags.push("time_overflow");
  }
  if (ctx.scoreSelf !== countCorrect) {
    flags.push("score_mismatch");
  }

  return {
    valid: flags.length === 0,
    flags: Array.from(new Set(flags)),
  };
}
