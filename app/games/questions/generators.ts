import type {
  Difficulty,
  Generator,
  GeneratorContext,
  Question,
  QuestionCategory,
} from "./types";
import { getQuestionHash } from "./hash";
import { mulberry32, randInt, shuffle } from "./rng";

function makeQuestion(
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

function numericDistractors(
  answer: number,
  rng: () => number,
  difficulty: Difficulty,
  count = 3,
): number[] {
  const span =
    difficulty === "easy"
      ? 6
      : difficulty === "medium"
        ? 14
        : difficulty === "hard"
          ? 25
          : 40;
  const set = new Set<number>();
  let attempts = 0;
  while (set.size < count && attempts < 60) {
    attempts++;
    let offset = randInt(rng, -span, span);
    if (offset === 0) offset = 1;
    const candidate = answer + offset;
    if (candidate !== answer && candidate >= 0) set.add(candidate);
  }
  while (set.size < count) {
    set.add(answer + (set.size + 1) * (span + 5));
  }
  return [...set];
}

// ─── Arithmetic generators ─────────────────────────────────────────────

const ADD_RANGES: Record<Difficulty, [number, number]> = {
  easy: [2, 9],
  medium: [11, 89],
  hard: [50, 199],
  expert: [100, 499],
};

export const generateAddition: Generator = ({ rng, difficulty }) => {
  const [min, max] = ADD_RANGES[difficulty];
  const a = randInt(rng, min, max);
  const b = randInt(rng, min, max);
  const answer = a + b;
  const opts = shuffle(
    [answer, ...numericDistractors(answer, rng, difficulty)],
    rng,
  );
  return makeQuestion(
    `${a} + ${b}`,
    opts.map(String),
    opts.indexOf(answer),
    "math",
    difficulty,
  );
};

const SUB_RANGES: Record<Difficulty, [number, number]> = {
  easy: [3, 19],
  medium: [20, 99],
  hard: [100, 299],
  expert: [200, 800],
};

export const generateSubtraction: Generator = ({ rng, difficulty }) => {
  const [min, max] = SUB_RANGES[difficulty];
  let a = randInt(rng, min, max);
  let b = randInt(rng, min, max);
  if (b > a) [a, b] = [b, a];
  if (a === b) a += 1;
  const answer = a - b;
  const opts = shuffle(
    [answer, ...numericDistractors(answer, rng, difficulty)],
    rng,
  );
  return makeQuestion(
    `${a} − ${b}`,
    opts.map(String),
    opts.indexOf(answer),
    "math",
    difficulty,
  );
};

const MUL_RANGES: Record<Difficulty, [number, number]> = {
  easy: [2, 9],
  medium: [3, 13],
  hard: [6, 19],
  expert: [10, 25],
};

export const generateMultiplication: Generator = ({ rng, difficulty }) => {
  const [min, max] = MUL_RANGES[difficulty];
  const a = randInt(rng, min, max);
  const b = randInt(rng, min, max);
  const answer = a * b;
  const opts = shuffle(
    [answer, ...numericDistractors(answer, rng, difficulty)],
    rng,
  );
  return makeQuestion(
    `${a} × ${b}`,
    opts.map(String),
    opts.indexOf(answer),
    "math",
    difficulty,
  );
};

// ─── Sequence generators ───────────────────────────────────────────────

const ARITH_DIFFS: Record<Difficulty, [number, number]> = {
  easy: [1, 4],
  medium: [2, 7],
  hard: [3, 11],
  expert: [4, 17],
};

export const generateArithmeticSequence: Generator = ({ rng, difficulty }) => {
  const [dMin, dMax] = ARITH_DIFFS[difficulty];
  const d = randInt(rng, dMin, dMax);
  const start = randInt(rng, 1, difficulty === "expert" ? 90 : 30);
  const seq = [start, start + d, start + d * 2, start + d * 3];
  const answer = start + d * 4;
  const opts = shuffle(
    [answer, ...numericDistractors(answer, rng, difficulty)],
    rng,
  );
  return makeQuestion(
    `Which number completes the sequence: ${seq.join(", ")}, ?`,
    opts.map(String),
    opts.indexOf(answer),
    "logic",
    difficulty,
  );
};

const GEO_RATIOS: Record<Difficulty, number[]> = {
  easy: [2],
  medium: [2, 3],
  hard: [2, 3, 4],
  expert: [2, 3, 4, 5],
};

export const generateGeometricSequence: Generator = ({ rng, difficulty }) => {
  const ratios = GEO_RATIOS[difficulty];
  const ratio = ratios[Math.floor(rng() * ratios.length)];
  const start = randInt(rng, 1, 4);
  const seq = [start, start * ratio, start * ratio * ratio, start * ratio ** 3];
  const answer = start * ratio ** 4;
  const opts = shuffle(
    [answer, ...numericDistractors(answer, rng, difficulty)],
    rng,
  );
  return makeQuestion(
    `Next in sequence: ${seq.join(", ")}, ?`,
    opts.map(String),
    opts.indexOf(answer),
    "logic",
    difficulty,
  );
};

// ─── Pattern generator ─────────────────────────────────────────────────

const SHAPE_POOL = ["▲", "◼", "●", "◆", "★", "◇", "❖", "⬢"] as const;

export const generatePattern: Generator = ({ rng, difficulty }) => {
  const idxA = Math.floor(rng() * SHAPE_POOL.length);
  let idxB = Math.floor(rng() * SHAPE_POOL.length);
  while (idxB === idxA) idxB = Math.floor(rng() * SHAPE_POOL.length);
  const a = SHAPE_POOL[idxA];
  const b = SHAPE_POOL[idxB];
  const seq = [a, b, a, b, a];
  const answer = b;

  const optionSet = new Set<string>([a, b]);
  while (optionSet.size < 4) {
    optionSet.add(SHAPE_POOL[Math.floor(rng() * SHAPE_POOL.length)]);
  }
  const options = shuffle([...optionSet], rng);
  return makeQuestion(
    `Which shape comes next?  ${seq.join(" ")} ?`,
    options,
    options.indexOf(answer),
    "logic",
    difficulty,
  );
};

// ─── Logic / letter sequence ───────────────────────────────────────────

export const generateMissingLetter: Generator = ({ rng, difficulty }) => {
  // Skip-by-2 pattern bounded so the answer fits in A–Z.
  const start = randInt(rng, 0, 17);
  const positions = [start, start + 2, start + 4, start + 6];
  const answerPos = start + 8;
  const seqLetters = positions.map((p) => String.fromCharCode(65 + p));
  const answerLetter = String.fromCharCode(65 + answerPos);

  const optionSet = new Set<string>([answerLetter]);
  let attempts = 0;
  while (optionSet.size < 4 && attempts < 30) {
    attempts++;
    const offset = randInt(rng, -4, 4);
    if (offset === 0) continue;
    const pos = answerPos + offset;
    if (pos >= 0 && pos < 26) optionSet.add(String.fromCharCode(65 + pos));
  }
  while (optionSet.size < 4) {
    optionSet.add(String.fromCharCode(65 + ((answerPos + 11) % 26)));
  }
  const options = shuffle([...optionSet], rng);
  return makeQuestion(
    `What is the missing letter?  ${seqLetters.join(" ")} ?`,
    options,
    options.indexOf(answerLetter),
    "logic",
    difficulty,
  );
};

// ─── Comparison ────────────────────────────────────────────────────────

const COMP_RANGES: Record<Difficulty, [number, number]> = {
  easy: [10, 50],
  medium: [25, 99],
  hard: [50, 199],
  expert: [100, 499],
};

export const generateComparison: Generator = ({ rng, difficulty }) => {
  const [min, max] = COMP_RANGES[difficulty];
  const a = randInt(rng, min, max);
  let b = randInt(rng, min, max);
  if (a === b) b = b + 1 > max ? b - 1 : b + 1;
  const answer = a > b ? a : b;
  const distractor = a > b ? b : a;
  const optionSet = new Set<number>([answer, distractor]);
  while (optionSet.size < 4) {
    const extra = randInt(rng, min, max);
    if (extra !== answer && extra !== distractor) optionSet.add(extra);
  }
  const options = shuffle([...optionSet], rng).map(String);
  return makeQuestion(
    `Which is larger: ${a} or ${b}?`,
    options,
    options.indexOf(String(answer)),
    "logic",
    difficulty,
  );
};

// ─── Quick calculation: percentage ─────────────────────────────────────

const QC_PCTS: Record<Difficulty, number[]> = {
  easy: [10, 25, 50],
  medium: [10, 20, 25, 50, 75],
  hard: [15, 30, 35, 40, 60],
  expert: [12, 17, 33, 42, 67],
};

const QC_NUMS: Record<Difficulty, [number, number]> = {
  easy: [20, 100],
  medium: [40, 200],
  hard: [100, 500],
  expert: [200, 1000],
};

export const generateQuickCalc: Generator = ({ rng, difficulty }) => {
  const pcts = QC_PCTS[difficulty];
  const [nMin, nMax] = QC_NUMS[difficulty];
  const pct = pcts[Math.floor(rng() * pcts.length)];

  // Pick a number that yields an integer answer when possible.
  let num = randInt(rng, nMin, nMax);
  let attempts = 0;
  while ((num * pct) % 100 !== 0 && attempts < 50) {
    attempts++;
    num = randInt(rng, nMin, nMax);
  }
  const answer = Math.round((num * pct) / 100);
  const opts = shuffle(
    [answer, ...numericDistractors(answer, rng, difficulty)],
    rng,
  );
  return makeQuestion(
    `What is ${pct}% of ${num}?`,
    opts.map(String),
    opts.indexOf(answer),
    "math",
    difficulty,
  );
};

// ─── Generator registry per game ───────────────────────────────────────

const GENERATORS: Record<string, Generator[]> = {
  quiz: [
    generateArithmeticSequence,
    generateGeometricSequence,
    generatePattern,
    generateMissingLetter,
    generateComparison,
    generateQuickCalc,
  ],
  math: [
    generateAddition,
    generateSubtraction,
    generateMultiplication,
    generateQuickCalc,
  ],
};

const FALLBACK_GENERATORS = GENERATORS.quiz;

/**
 * Generate a single deterministic question.
 *
 * Same (gameId, difficulty, seed) → identical question every time, on
 * any machine. The seed is the only source of variation.
 */
export function generateQuestion(
  gameId: string,
  difficulty: Difficulty,
  seed: number,
): Question {
  const rng = mulberry32(seed);
  const gens = GENERATORS[gameId] ?? FALLBACK_GENERATORS;
  const gen = gens[Math.floor(rng() * gens.length)];
  return gen({ rng, difficulty });
}

/** Used by tests / docs to enumerate which categories a game uses. */
export function generatorsForGame(gameId: string): readonly Generator[] {
  return GENERATORS[gameId] ?? FALLBACK_GENERATORS;
}

export type { GeneratorContext };
