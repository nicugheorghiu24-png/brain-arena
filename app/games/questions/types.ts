export type Difficulty = "easy" | "medium" | "hard" | "expert";

export type QuestionCategory = "logic" | "memory" | "math";

export type Question = {
  id: string;
  text: string;
  options: string[];
  correctIndex: number;
  category: QuestionCategory;
  difficulty: Difficulty;
};

export type GeneratorContext = {
  rng: () => number;
  difficulty: Difficulty;
};

export type Generator = (ctx: GeneratorContext) => Question;

export type SeenMap = Record<string, number>;
