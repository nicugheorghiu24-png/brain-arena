import type {
  Achievement,
  LeaderboardEntry,
  Match,
  ProfileData,
  Rarity,
} from "./types";

export const FAKE_LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, username: "Vex", tier: "Master", division: "I", lp: 4120, wins: 412, losses: 89, region: "EU" },
  { rank: 2, username: "Echo", tier: "Master", division: "I", lp: 3890, wins: 380, losses: 102, region: "NA" },
  { rank: 3, username: "Zenith", tier: "Diamond", division: "I", lp: 3050, wins: 298, losses: 95, region: "EU" },
  { rank: 4, username: "PixelHawk", tier: "Diamond", division: "I", lp: 2730, wins: 261, losses: 88, region: "NA" },
  { rank: 5, username: "you", tier: "Diamond", division: "II", lp: 2480, wins: 127, losses: 43, region: "EU", isYou: true },
  { rank: 6, username: "NovaByte", tier: "Diamond", division: "II", lp: 2410, wins: 240, losses: 110, region: "AS" },
  { rank: 7, username: "QuarkX", tier: "Diamond", division: "III", lp: 2210, wins: 215, losses: 105, region: "EU" },
  { rank: 8, username: "GlitchWolf", tier: "Diamond", division: "III", lp: 2050, wins: 198, losses: 95, region: "NA" },
  { rank: 9, username: "OrbitJay", tier: "Platinum", division: "I", lp: 1950, wins: 190, losses: 100, region: "EU" },
  { rank: 10, username: "Cipher", tier: "Platinum", division: "I", lp: 1880, wins: 178, losses: 92, region: "AS" },
  { rank: 11, username: "Nyx", tier: "Platinum", division: "II", lp: 1720, wins: 165, losses: 90, region: "EU" },
  { rank: 12, username: "Rune", tier: "Platinum", division: "II", lp: 1640, wins: 158, losses: 88, region: "NA" },
  { rank: 13, username: "FluxCat", tier: "Platinum", division: "III", lp: 1510, wins: 145, losses: 87, region: "EU" },
  { rank: 14, username: "Spark", tier: "Gold", division: "I", lp: 1380, wins: 132, losses: 90, region: "AS" },
  { rank: 15, username: "Volt", tier: "Gold", division: "I", lp: 1320, wins: 125, losses: 88, region: "NA" },
  { rank: 16, username: "Halcyon", tier: "Gold", division: "II", lp: 1240, wins: 118, losses: 86, region: "EU" },
  { rank: 17, username: "Kairo", tier: "Gold", division: "II", lp: 1180, wins: 112, losses: 84, region: "NA" },
  { rank: 18, username: "Aether", tier: "Gold", division: "III", lp: 1050, wins: 102, losses: 80, region: "AS" },
  { rank: 19, username: "Pulse", tier: "Silver", division: "I", lp: 920, wins: 95, losses: 78, region: "EU" },
  { rank: 20, username: "Drift", tier: "Silver", division: "I", lp: 860, wins: 88, losses: 76, region: "NA" },
];

export const FAKE_MATCH_HISTORY: Match[] = [
  { id: "m1", opponent: "PixelHawk", mode: "Logic 1v1", result: "W", myScore: 8, oppScore: 5, delta: 18, timestamp: "12 min ago" },
  { id: "m2", opponent: "NovaByte", mode: "Memory Sprint", result: "W", myScore: 10, oppScore: 7, delta: 22, timestamp: "1 h ago" },
  { id: "m3", opponent: "Zenith", mode: "Reaction Duel", result: "L", myScore: 4, oppScore: 7, delta: -15, timestamp: "3 h ago" },
  { id: "m4", opponent: "QuarkX", mode: "Logic 1v1", result: "W", myScore: 9, oppScore: 2, delta: 24, timestamp: "Yesterday" },
  { id: "m5", opponent: "GlitchWolf", mode: "Memory Sprint", result: "L", myScore: 5, oppScore: 8, delta: -12, timestamp: "Yesterday" },
  { id: "m6", opponent: "Cipher", mode: "Logic 1v1", result: "W", myScore: 7, oppScore: 6, delta: 16, timestamp: "2 days ago" },
  { id: "m7", opponent: "Nyx", mode: "Reaction Duel", result: "W", myScore: 8, oppScore: 4, delta: 20, timestamp: "2 days ago" },
];

export const FAKE_ACHIEVEMENTS: Achievement[] = [
  { id: "a1", title: "First Blood", description: "Win your first match.", icon: "🩸", unlocked: true, rarity: "common" },
  { id: "a2", title: "Streak Hunter", description: "Win 5 matches in a row.", icon: "🔥", unlocked: true, rarity: "rare" },
  { id: "a3", title: "Logician", description: "Win 50 Logic 1v1 matches.", icon: "🧠", unlocked: true, rarity: "rare" },
  { id: "a4", title: "Mind Palace", description: "Score 10/10 in a Memory Sprint.", icon: "🏛️", unlocked: true, rarity: "epic" },
  { id: "a5", title: "Speed Demon", description: "Answer in under 2 seconds, 25 times.", icon: "⚡", unlocked: false, progress: 64, rarity: "epic" },
  { id: "a6", title: "Diamond Mind", description: "Reach Diamond tier.", icon: "💎", unlocked: true, rarity: "epic" },
  { id: "a7", title: "Unbreakable", description: "Win 15 matches in a row.", icon: "🛡️", unlocked: false, progress: 80, rarity: "legendary" },
  { id: "a8", title: "Master of Arena", description: "Reach Master tier.", icon: "👑", unlocked: false, progress: 41, rarity: "legendary" },
  { id: "a9", title: "Comeback Kid", description: "Win after being 5 points behind.", icon: "🎯", unlocked: true, rarity: "rare" },
  { id: "a10", title: "Veteran", description: "Play 500 matches.", icon: "🎖️", unlocked: false, progress: 34, rarity: "common" },
  { id: "a11", title: "Pure Logic", description: "Win a match without any wrong answer.", icon: "✨", unlocked: false, progress: 88, rarity: "epic" },
  { id: "a12", title: "Untouchable", description: "Win 10 matches without losing a round.", icon: "🌟", unlocked: false, progress: 60, rarity: "legendary" },
];

export const DEFAULT_PROFILE: ProfileData = {
  username: "Challenger",
  tier: "Diamond",
  division: "II",
  lp: 2480,
  level: 27,
  xp: 1840,
  xpToNext: 2500,
  joinedAt: "2025-08-14",
  region: "EU",
  bio: "Logic, speed, memory. No luck. Just skill.",
  wins: 127,
  losses: 43,
  bestStreak: 12,
};

export function rarityClass(r: Rarity): string {
  switch (r) {
    case "common":
      return "border-slate-400/30 from-slate-500/5 to-slate-500/10";
    case "rare":
      return "border-cyan-400/40 from-cyan-500/10 to-cyan-500/5";
    case "epic":
      return "border-violet-400/40 from-violet-500/10 to-fuchsia-500/5";
    case "legendary":
      return "border-amber-400/50 from-amber-500/15 to-rose-500/5";
  }
}

export function rarityLabel(r: Rarity): string {
  return r.charAt(0).toUpperCase() + r.slice(1);
}
