import type { Question } from "./types";

/**
 * Stable content-derived hash. Same (text, options, correctIndex) always
 * produces the same id, regardless of which generator or seed produced it.
 *
 * This is essential for the seen-history filter: the filter dedupes on
 * SEMANTIC content equality, not on procedural-seed equality.
 */
export function getQuestionHash(
  q: Pick<Question, "text" | "options" | "correctIndex">,
): string {
  const input = `${q.text}|${q.options.join("")}|${q.correctIndex}`;
  // FNV-1a 32-bit
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
