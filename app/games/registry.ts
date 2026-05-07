import type { GameId, GameMeta } from "./types";

const REGISTRY: Record<string, GameMeta> = {
  quiz: {
    id: "quiz",
    label: "Logic 1v1",
    description: "5 quick questions. Out-think your opponent.",
    mode: "Logic 1v1",
    avgDurationSec: 75,
    category: "logic",
    icon: "🎯",
    routePath: "/arena",
    defaultDifficulty: "medium",
    matchMode: "both",
  },
  memory: {
    id: "memory",
    label: "Memory Match",
    description: "Flip pairs from memory. Most pairs wins.",
    mode: "Memory Match",
    avgDurationSec: 90,
    category: "memory",
    icon: "🧠",
    routePath: "/memory",
    defaultDifficulty: "medium",
    matchMode: "casual",
  },
  reaction: {
    id: "reaction",
    label: "Reaction Duel",
    description: "First to react wins. Don't false-start.",
    mode: "Reaction Duel",
    avgDurationSec: 30,
    category: "reaction",
    icon: "🚦",
    routePath: "/reaction",
    defaultDifficulty: "easy",
    matchMode: "ranked",
  },
  math: {
    id: "math",
    label: "Math Sprint",
    description: "60 seconds. Solve as many as you can.",
    mode: "Math Sprint",
    avgDurationSec: 60,
    category: "math",
    icon: "🧮",
    routePath: "/math",
    defaultDifficulty: "medium",
    matchMode: "both",
  },
  chess: {
    id: "chess",
    label: "Chess Arena",
    description: "Classical chess with server-authoritative move validation.",
    mode: "Chess Arena",
    avgDurationSec: 240,
    category: "strategy",
    icon: "♟️",
    routePath: "/chess",
    matchMode: "ranked",
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
