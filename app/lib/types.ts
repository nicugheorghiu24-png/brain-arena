export type Tier =
  | "Bronze"
  | "Silver"
  | "Gold"
  | "Platinum"
  | "Diamond"
  | "Master";

export type Division = "I" | "II" | "III" | "IV";

export type LeaderboardEntry = {
  rank: number;
  username: string;
  tier: Tier;
  division: Division;
  lp: number;
  wins: number;
  losses: number;
  region: string;
  isYou?: boolean;
};

export type Match = {
  id: string;
  opponent: string;
  mode: string;
  result: "W" | "L";
  myScore: number;
  oppScore: number;
  delta: number;
  timestamp: string;
};

export type Rarity = "common" | "rare" | "epic" | "legendary";

export type Achievement = {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  progress?: number;
  rarity: Rarity;
};

export type ProfileData = {
  username: string;
  email?: string;
  tier: Tier;
  division: Division;
  lp: number;
  level: number;
  xp: number;
  xpToNext: number;
  joinedAt: string;
  region: string;
  bio: string;
  wins: number;
  losses: number;
  bestStreak: number;
};

// The Question type now lives in app/games/questions/types.ts and includes
// difficulty + a stable content hash (id) for the 60-day no-repeat system.
