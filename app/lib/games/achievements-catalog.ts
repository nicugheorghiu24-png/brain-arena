/**
 * Achievement catalog — pure data, no server-only imports.
 *
 * Lives here (not inside lib/services/achievements.ts) so that client
 * components can import the catalog without pulling Prisma into the
 * browser bundle. The server service in lib/services/achievements.ts
 * re-exports this same data for auto-awarding + DB upsert.
 *
 * Adding a new achievement: append here, then add a check for it in
 * unlockAchievementsForOutcome() in lib/services/achievements.ts.
 */

export type AchievementRarity = "common" | "rare" | "epic" | "legendary";

export type AchievementRecord = {
  id: string;
  title: string;
  description: string;
  icon: string;
  rarity: AchievementRarity;
};

export const ACHIEVEMENT_CATALOG: readonly AchievementRecord[] = [
  {
    id: "first_win",
    title: "First Blood",
    description: "Win your very first match.",
    icon: "🎯",
    rarity: "common",
  },
  {
    id: "streak_3",
    title: "Hot Streak",
    description: "Win 3 matches in a row.",
    icon: "🔥",
    rarity: "common",
  },
  {
    id: "streak_5",
    title: "On Fire",
    description: "Win 5 matches in a row.",
    icon: "🔥🔥",
    rarity: "rare",
  },
  {
    id: "streak_10",
    title: "Unstoppable",
    description: "Win 10 matches in a row.",
    icon: "⚡",
    rarity: "epic",
  },
  {
    id: "played_10",
    title: "Getting Warm",
    description: "Play 10 matches.",
    icon: "🎮",
    rarity: "common",
  },
  {
    id: "played_50",
    title: "Veteran",
    description: "Play 50 matches.",
    icon: "🎖️",
    rarity: "rare",
  },
  {
    id: "tier_silver",
    title: "Silver Climb",
    description: "Reach Silver tier.",
    icon: "🥈",
    rarity: "common",
  },
  {
    id: "tier_gold",
    title: "Gold Standard",
    description: "Reach Gold tier.",
    icon: "🥇",
    rarity: "rare",
  },
  {
    id: "tier_platinum",
    title: "Platinum Mind",
    description: "Reach Platinum tier.",
    icon: "💎",
    rarity: "epic",
  },
  {
    id: "tier_diamond",
    title: "Diamond Brain",
    description: "Reach Diamond tier.",
    icon: "💠",
    rarity: "legendary",
  },
] as const;
