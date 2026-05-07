import { getQuestionHash } from "./hash";
import type { Difficulty, Question, QuestionCategory } from "./types";

function fix(
  text: string,
  options: string[],
  correctIndex: number,
  category: QuestionCategory,
  difficulty: Difficulty,
): Question {
  return {
    id: getQuestionHash({ text, options, correctIndex }),
    text,
    options,
    correctIndex,
    category,
    difficulty,
  };
}

/**
 * Curated fixed pool. The match assembler tries these first (deterministic
 * shuffle by the match seed, plus the 60-day filter) before falling back
 * to procedural generation. Empty pool means all-procedural for that game.
 */
export const FIXED_POOL: Record<string, Question[]> = {
  quiz: [
    fix(
      "Which number completes the sequence: 2, 4, 8, 16, ?",
      ["20", "24", "32", "64"],
      2,
      "logic",
      "medium",
    ),
    fix(
      "If all cyans are blue, and some blues are green, then…",
      [
        "All cyans are green",
        "Some cyans may be green",
        "No cyans are green",
        "Cannot be determined",
      ],
      3,
      "logic",
      "hard",
    ),
    fix(
      "Which shape comes next?  ▲ ◼ ▲ ◼ ▲ ?",
      ["▲", "◼", "●", "◆"],
      1,
      "logic",
      "easy",
    ),
    fix(
      "What is the missing letter?  A C F J O ?",
      ["S", "T", "U", "V"],
      2,
      "logic",
      "hard",
    ),
    fix(
      "5 machines make 5 widgets in 5 minutes. How long for 100 machines to make 100 widgets?",
      ["100 min", "20 min", "5 min", "1 min"],
      2,
      "logic",
      "hard",
    ),
  ],
  math: [],
};
