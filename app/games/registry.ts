import type { GameId, GameMeta } from "./types";

const REGISTRY: Record<string, GameMeta> = {
  quiz: {
    id: "quiz",
    label: "Logic Quiz",
    description: "5 quick questions vs an AI opponent. Out-think the bot.",
    mode: "Logic Quiz",
    avgDurationSec: 75,
    category: "logic",
    icon: "🎯",
    routePath: "/arena",
    defaultDifficulty: "medium",
    matchMode: "casual",
    opponent: "ai",
  },
  memory: {
    id: "memory",
    label: "Memory Match",
    description: "Flip pairs from memory. Outscore the AI.",
    mode: "Memory Match",
    avgDurationSec: 90,
    category: "memory",
    icon: "🧠",
    routePath: "/memory",
    defaultDifficulty: "medium",
    matchMode: "casual",
    opponent: "ai",
  },
  reaction: {
    id: "reaction",
    label: "Reaction Duel",
    description: "First to react wins. Beat the AI without false-starting.",
    mode: "Reaction Duel",
    avgDurationSec: 30,
    category: "reaction",
    icon: "🚦",
    routePath: "/reaction",
    defaultDifficulty: "easy",
    matchMode: "casual",
    opponent: "ai",
  },
  math: {
    id: "math",
    label: "Math Sprint",
    description: "60 seconds. Solve as many as you can — head-to-head vs AI.",
    mode: "Math Sprint",
    avgDurationSec: 60,
    category: "math",
    icon: "🧮",
    routePath: "/math",
    defaultDifficulty: "medium",
    matchMode: "casual",
    opponent: "ai",
  },
  chess: {
    id: "chess",
    label: "Chess Arena",
    description: "Real-time 1v1 vs another player. Server-validated moves and clocks.",
    mode: "Chess Arena",
    avgDurationSec: 240,
    category: "strategy",
    icon: "♟️",
    routePath: "/chess",
    matchMode: "ranked",
    opponent: "pvp",
  },
};

export function getGame(id: GameId): GameMeta | undefined {
  return REGISTRY[id];
}

export function listGames(): GameMeta[] {
  return Object.values(REGISTRY);
}

export function isKnownGame(id: string): boolean {
  return id in REGISTRY;
}
