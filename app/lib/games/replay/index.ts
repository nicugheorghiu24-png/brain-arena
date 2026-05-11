/**
 * Replay validation framework.
 *
 * Each game can opt-in to server-side validation of the player's
 * submitted result by including an `inputs` field in the
 * `POST /api/matches` body. The /api/matches route looks up a
 * validator for the gameId here, runs it, and:
 *
 *   - on `valid: true`  → record normally; mark inputsValidated=true
 *   - on `valid: false` → record but clamp lpDelta to 0, save the
 *                         flags array on auditFlags, and write an
 *                         audit_events row with category="replay"
 *
 * Games that don't have a validator yet are simply skipped: their
 * results record with `inputsValidated=false` and no audit event.
 * That preserves backwards compat — existing solo games (memory,
 * reaction, quiz) keep working until each has a per-game validator.
 *
 * See ANTI_CHEAT_ARCHITECTURE.md for the threat model and the
 * roadmap from "bounds-only" to "true server-deterministic replay".
 */

import { mathValidator, type MathInputs } from "./math";
import { memoryValidator, type MemoryInputs } from "./memory";
import { reactionValidator, type ReactionInputs } from "./reaction";
import { quizValidator, type QuizInputs } from "./quiz";

export type ValidationContext = {
  gameId: string;
  scoreSelf: number;
  scoreOpponent: number;
  rounds: number;
  durationMs: number;
  difficulty: string;
  matchSeed?: number;
};

export type ValidationResult = {
  valid: boolean;
  flags: string[];
};

export type Validator = (
  ctx: ValidationContext,
  inputs: unknown,
) => ValidationResult;

/**
 * Discriminated input type. Each entry is the inputs shape for one
 * gameId, exactly as the client sends it. New games append here.
 */
export type GameInputs = MathInputs | MemoryInputs | ReactionInputs | QuizInputs;

const REGISTRY: Record<string, Validator> = {
  math: mathValidator,
  memory: memoryValidator,
  reaction: reactionValidator,
  quiz: quizValidator,
};

export function getValidator(gameId: string): Validator | null {
  return REGISTRY[gameId] ?? null;
}
