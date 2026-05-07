/**
 * Match-level utilities. The fairness contract is:
 *
 *   1. createMatchSeed() is called ONCE per match — by the matchmaker /
 *      match host. The resulting seed is shared with every participant.
 *   2. generateDeterministicQuestionSet() is the canonical pure entry
 *      point that maps (seed, gameId, count, difficulty) → Question[].
 *      All clients call it with the SAME inputs and get IDENTICAL output.
 *   3. validateFairMatch() is an assertion helper for tests / runtime
 *      sanity checks: feed it the configs of all participants and it
 *      throws if any field would create unequal conditions.
 */

import {
  generateQuestionSet,
  generateFreshQuestionSet,
  nextMatchSeed as nextSeedImpl,
  type Difficulty,
  type Question,
} from "../questions";

export type MatchConfig = {
  gameId: string;
  matchSeed: number;
  difficulty: Difficulty;
  rounds: number;
  perRoundSeconds: number;
};

/**
 * Generate a fresh match seed. SSR-safe (returns 0 when invoked during
 * build); callers must invoke from an effect or event handler.
 */
export function createMatchSeed(): number {
  return nextSeedImpl();
}

/**
 * Pure deterministic question generation. Use this in PvP — every client
 * receives the same seed from the matchmaker and calls this directly.
 */
export function generateDeterministicQuestionSet(
  gameId: string,
  count: number,
  difficulty: Difficulty,
  seed: number,
): Question[] {
  return generateQuestionSet(gameId, count, difficulty, seed);
}

/**
 * Solo / matchmaker entry: same as above, plus 60-day no-repeat filter
 * for the calling user's history. Output is then BROADCAST to all
 * participants; clients never call this themselves during a match.
 */
export function generateMatchQuestionSetForUser(
  gameId: string,
  count: number,
  difficulty: Difficulty,
  seed: number,
  userId: string | null,
): Question[] {
  return generateFreshQuestionSet(gameId, count, difficulty, seed, userId);
}

export type ParticipantConfig = {
  participantId: string;
  config: MatchConfig;
};

/**
 * Throws if any two participants would face different match conditions.
 * Use as a runtime assertion right before a match starts.
 */
export function validateFairMatch(participants: ParticipantConfig[]): void {
  if (participants.length < 2) return;
  const [first, ...rest] = participants;
  const c0 = first.config;
  for (const p of rest) {
    const c = p.config;
    const mismatches: string[] = [];
    if (c.gameId !== c0.gameId) mismatches.push("gameId");
    if (c.matchSeed !== c0.matchSeed) mismatches.push("matchSeed");
    if (c.difficulty !== c0.difficulty) mismatches.push("difficulty");
    if (c.rounds !== c0.rounds) mismatches.push("rounds");
    if (c.perRoundSeconds !== c0.perRoundSeconds) {
      mismatches.push("perRoundSeconds");
    }
    if (mismatches.length > 0) {
      throw new Error(
        `Unfair match config: participant ${p.participantId} differs from ${first.participantId} on [${mismatches.join(", ")}]`,
      );
    }
  }
}
