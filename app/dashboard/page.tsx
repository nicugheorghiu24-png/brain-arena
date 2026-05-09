"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../components/AuthProvider";
import { DEFAULT_PROFILE } from "../lib/fakeData";
import PlayerStats from "../components/dashboard/PlayerStats";
import RankCard from "../components/dashboard/RankCard";
import MatchHistory from "../components/dashboard/MatchHistory";
import LeaderboardPreview from "../components/dashboard/LeaderboardPreview";
import { XPCard } from "../components/dashboard/XPCard";
import { AchievementsTeaser } from "../components/dashboard/AchievementsTeaser";

const FALLBACK_PROFILE = {
  tier: DEFAULT_PROFILE.tier,
  division: DEFAULT_PROFILE.division,
  lp: 0,
  level: 1,
  xp: 0,
  xpToNext: 800,
  wins: 0,
  losses: 0,
  currentStreak: 0,
  bestStreak: 0,
  placementMatchesPlayed: 0,
  isProvisional: true,
};

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();

  // The dashboard requires auth — bounce anonymous viewers to /login.
  useEffect(() => {
    if (!user) router.replace("/login");
  }, [user, router]);

  if (!user) {
    return (
      <main className="page-enter app-aurora flex min-h-[calc(100vh-4rem)] items-center justify-center bg-gradient-to-br from-black via-slate-950 to-cyan-950 px-6 py-12 text-white">
        <p className="text-sm text-gray-400">Redirecting to login…</p>
      </main>
    );
  }

  const profile = user.profile ?? FALLBACK_PROFILE;
  const displayName = user.username;

  return (
    <main className="page-enter app-aurora min-h-[calc(100vh-4rem)] bg-gradient-to-br from-black via-slate-950 to-cyan-950 px-4 py-8 text-white sm:px-6 sm:py-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-cyan-300/70">
              Welcome back
            </p>
            <h1 className="mt-1 text-4xl font-extrabold md:text-5xl">
              {displayName}
            </h1>
            <p className="mt-2 text-sm text-gray-400">
              Pregătit pentru următoarea arenă?
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-72">
            <Link
              href="/games"
              className="group relative w-full overflow-hidden rounded-2xl bg-cyan-400 px-8 py-5 text-center text-lg font-extrabold text-black transition-all duration-200 hover:-translate-y-0.5 hover:bg-cyan-300 hover:shadow-[0_0_36px_-2px_rgba(34,211,238,0.95)]"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover:translate-x-full"
              />
              Play Now
            </Link>
            <Link
              href="/leaderboard"
              className="rounded-2xl border border-white/15 px-6 py-2.5 text-center text-sm font-semibold text-gray-300 transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-400/40 hover:text-cyan-200"
            >
              View leaderboard
            </Link>
          </div>
        </header>

        <PlayerStats
          wins={profile.wins}
          losses={profile.losses}
          bestStreak={profile.bestStreak}
        />

        <XPCard
          level={profile.level}
          xp={profile.xp}
          xpToNext={profile.xpToNext}
        />

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <RankCard
              tier={profile.tier}
              division={profile.division}
              lp={profile.lp}
              isProvisional={profile.isProvisional ?? false}
              placementMatchesPlayed={profile.placementMatchesPlayed ?? 0}
            />
          </div>
          <div className="lg:col-span-2">
            <MatchHistory />
          </div>
        </div>

        <AchievementsTeaser />

        <LeaderboardPreview />
      </div>
    </main>
  );
}
