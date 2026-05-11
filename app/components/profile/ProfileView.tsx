"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../AuthProvider";
import {
  FAKE_LEADERBOARD,
  rarityClass,
  rarityLabel,
} from "../../lib/fakeData";
import { Avatar } from "../ui/Avatar";
import { TierBadge } from "../ui/TierBadge";
import { ProgressBar } from "../ui/ProgressBar";
import type { MatchRecord, ProfileRecord } from "../../lib/db";
import { listGames } from "../../games/registry";
import { ACHIEVEMENT_CATALOG } from "../../lib/games/achievements-catalog";

type Tab = "achievements" | "history";

type Props = {
  username: string;
};

function makeFallbackProfile(username: string): ProfileRecord | null {
  // If the requested username matches a row in the seeded leaderboard,
  // synthesize a read-only profile. Lets leaderboard click-through work
  // before there is real backend data.
  const seed = FAKE_LEADERBOARD.find(
    (r) => r.username.toLowerCase() === username.toLowerCase(),
  );
  if (!seed) return null;
  return {
    id: `seed:${seed.username.toLowerCase()}`,
    username: seed.username,
    tier: seed.tier,
    division: seed.division,
    lp: seed.lp,
    level: Math.max(1, Math.floor(seed.lp / 80)),
    xp: seed.lp % 800,
    xpToNext: 800,
    bio: `${seed.tier} ${seed.division} · ${seed.region}`,
    region: seed.region,
    joinedAt: "2025-08-14",
    wins: seed.wins,
    losses: seed.losses,
    bestStreak: Math.max(3, Math.floor(seed.wins / 25)),
  };
}

const toneClass = {
  emerald: "text-emerald-300",
  rose: "text-rose-300",
  cyan: "text-cyan-200",
  amber: "text-amber-300",
} as const;

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: keyof typeof toneClass;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-400/30 hover:bg-white/[0.07] sm:p-5">
      <div className="text-xs uppercase tracking-widest text-gray-400">
        {label}
      </div>
      <div className={`mt-2 text-2xl font-bold sm:text-3xl ${toneClass[tone]}`}>
        {value}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={`relative px-4 py-2.5 text-sm font-semibold transition-colors ${
        active ? "text-cyan-200" : "text-gray-400 hover:text-cyan-200"
      }`}
    >
      {children}
      {active && (
        <span className="absolute inset-x-0 -bottom-px h-0.5 bg-gradient-to-r from-transparent via-cyan-300 to-transparent" />
      )}
    </button>
  );
}

export function ProfileView({ username }: Props) {
  const { user: viewer } = useAuth();
  const viewerName =
    viewer?.username ?? viewer?.email?.split("@")[0] ?? null;
  const isOwn = viewerName?.toLowerCase() === username.toLowerCase();

  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("achievements");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Own profile: data is already in the AuthProvider context
      // (server-side cookies() in the root layout populates it). No
      // fetch needed for the profile fields. Match history comes from
      // /api/matches; achievements from viewer.unlockedAchievementIds.
      if (isOwn && viewer && viewer.profile) {
        const own: ProfileRecord = {
          id: viewer.id,
          username: viewer.username,
          email: viewer.email,
          tier: viewer.profile.tier as ProfileRecord["tier"],
          division: viewer.profile.division as ProfileRecord["division"],
          lp: viewer.profile.lp,
          level: viewer.profile.level,
          xp: viewer.profile.xp,
          xpToNext: viewer.profile.xpToNext,
          bio: viewer.profile.bio,
          region: viewer.profile.region,
          joinedAt: viewer.profile.joinedAt.slice(0, 10),
          wins: viewer.profile.wins,
          losses: viewer.profile.losses,
          bestStreak: viewer.profile.bestStreak,
          favoriteGameId: viewer.profile.favoriteGameId ?? undefined,
        };
        if (cancelled) return;
        setProfile(own);
        setUnlockedIds(new Set(viewer.unlockedAchievementIds ?? []));

        // Own match history via the server-authoritative endpoint.
        try {
          const res = await fetch("/api/matches?limit=12", {
            credentials: "include",
            cache: "no-store",
          });
          if (res.ok) {
            const data = (await res.json()) as {
              matches: Array<{
                id: string;
                gameId: string;
                difficulty: string;
                rounds: number;
                durationMs: number;
                playerName: string;
                opponentName: string;
                result: "win" | "loss" | "draw";
                scoreSelf: number;
                scoreOpponent: number;
                lpDelta: number;
                xpGained: number;
                createdAt: string;
              }>;
            };
            if (!cancelled) {
              setMatches(
                data.matches.map(
                  (m): MatchRecord => ({
                    id: m.id,
                    gameId: m.gameId,
                    matchSeed: 0,
                    difficulty: m.difficulty,
                    playerId: viewer.id,
                    playerName: m.playerName,
                    opponentName: m.opponentName,
                    result: m.result,
                    scoreSelf: m.scoreSelf,
                    scoreOpponent: m.scoreOpponent,
                    durationMs: m.durationMs,
                    rounds: m.rounds,
                    lpDelta: m.lpDelta,
                    xpGained: m.xpGained,
                    createdAt: new Date(m.createdAt).getTime(),
                  }),
                ),
              );
            }
          }
        } catch {
          // network blip: leave matches empty rather than crash
        }
        if (!cancelled) setLoading(false);
        return;
      }

      // Anyone else's profile: hit the public lookup endpoint. Falls
      // back to FAKE_LEADERBOARD seed if the username is a seeded
      // demo entry (so leaderboard click-through to demo rows still
      // works visually).
      try {
        const res = await fetch(
          `/api/profile/${encodeURIComponent(username)}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const data = (await res.json()) as {
            ok: true;
            profile: {
              username: string;
              tier: string;
              division: string;
              lp: number;
              level: number;
              xp: number;
              xpToNext: number;
              wins: number;
              losses: number;
              currentStreak: number;
              bestStreak: number;
              region: string;
              bio: string;
              joinedAt: string;
              favoriteGameId: string | null;
            };
            unlockedAchievements: Array<{ id: string; unlockedAt: string }>;
            recentMatches: Array<{
              id: string;
              gameId: string;
              difficulty: string;
              durationMs: number;
              result: "win" | "loss" | "draw";
              scoreSelf: number;
              scoreOpponent: number;
              opponentName: string;
              lpDelta: number;
              xpGained: number;
              createdAt: string;
            }>;
          };
          if (cancelled) return;
          setProfile({
            id: `pub:${data.profile.username.toLowerCase()}`,
            username: data.profile.username,
            tier: data.profile.tier as ProfileRecord["tier"],
            division: data.profile.division as ProfileRecord["division"],
            lp: data.profile.lp,
            level: data.profile.level,
            xp: data.profile.xp,
            xpToNext: data.profile.xpToNext,
            bio: data.profile.bio,
            region: data.profile.region,
            joinedAt: data.profile.joinedAt.slice(0, 10),
            wins: data.profile.wins,
            losses: data.profile.losses,
            bestStreak: data.profile.bestStreak,
            favoriteGameId: data.profile.favoriteGameId ?? undefined,
          });
          setUnlockedIds(new Set(data.unlockedAchievements.map((a) => a.id)));
          setMatches(
            data.recentMatches.map(
              (m): MatchRecord => ({
                id: m.id,
                gameId: m.gameId,
                matchSeed: 0,
                difficulty: m.difficulty,
                playerId: `pub:${data.profile.username.toLowerCase()}`,
                playerName: data.profile.username,
                opponentName: m.opponentName,
                result: m.result,
                scoreSelf: m.scoreSelf,
                scoreOpponent: m.scoreOpponent,
                durationMs: m.durationMs,
                rounds: 0,
                lpDelta: m.lpDelta,
                xpGained: m.xpGained,
                createdAt: new Date(m.createdAt).getTime(),
              }),
            ),
          );
          if (!cancelled) setLoading(false);
          return;
        }
      } catch {
        // network/404 falls through to the seeded fallback below
      }

      // Last resort: if the username matches a seeded leaderboard
      // entry, show a synthetic profile. Real users that don't
      // exist (typos in URLs) get the "not found" empty state.
      if (!cancelled) {
        setProfile(makeFallbackProfile(username));
        setMatches([]);
        setUnlockedIds(new Set());
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username, isOwn, viewer]);

  if (loading) {
    return <ProfileSkeleton />;
  }

  if (!profile) {
    return (
      <main className="page-enter app-aurora flex min-h-[calc(100vh-4rem)] items-center justify-center bg-gradient-to-br from-black via-slate-950 to-cyan-950 px-6 text-white">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-10 text-center backdrop-blur">
          <div className="text-xs uppercase tracking-widest text-rose-300/80">
            Not found
          </div>
          <h1 className="mt-2 text-3xl font-extrabold">
            No player named &quot;{username}&quot;
          </h1>
          <p className="mt-3 text-sm text-gray-400">
            They may not have joined yet, or the username is misspelled.
          </p>
          <Link
            href="/leaderboard"
            className="mt-6 inline-flex rounded-xl border border-cyan-400/40 px-4 py-2 text-sm font-semibold text-cyan-200 hover:-translate-y-0.5 hover:bg-cyan-400/10"
          >
            Back to leaderboard
          </Link>
        </div>
      </main>
    );
  }

  const totalGames = profile.wins + profile.losses;
  const winPct = totalGames
    ? Math.round((profile.wins / totalGames) * 100)
    : 0;
  const xpPct = Math.round((profile.xp / Math.max(1, profile.xpToNext)) * 100);

  // Compute favorite game from match history
  const counts = new Map<string, number>();
  for (const m of matches) counts.set(m.gameId, (counts.get(m.gameId) ?? 0) + 1);
  let favoriteGameId: string | undefined;
  let topCount = 0;
  for (const [g, c] of counts) {
    if (c > topCount) {
      topCount = c;
      favoriteGameId = g;
    }
  }
  const favoriteGameLabel = favoriteGameId
    ? listGames().find((g) => g.id === favoriteGameId)?.label
    : undefined;

  return (
    <main className="page-enter app-aurora min-h-[calc(100vh-4rem)] bg-gradient-to-br from-black via-slate-950 to-cyan-950 px-4 py-8 text-white sm:px-6 sm:py-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 via-slate-900 to-black p-6 sm:p-8">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-cyan-400/15 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-24 -left-12 h-72 w-72 rounded-full bg-fuchsia-500/10 blur-3xl"
          />

          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
            <Avatar name={profile.username} size="xl" glow />
            <div className="flex-1">
              <p className="text-xs uppercase tracking-widest text-cyan-300/70">
                Profile {isOwn && <span className="text-cyan-400">· you</span>}
              </p>
              <h1 className="mt-1 text-4xl font-extrabold md:text-5xl">
                {profile.username}
              </h1>
              <p className="mt-2 max-w-xl text-sm text-gray-400">
                {profile.bio || "Brain Arena competitor."}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <TierBadge tier={profile.tier} division={profile.division} />
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-gray-300">
                  Level {profile.level}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-gray-300">
                  Region {profile.region}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-gray-300">
                  Joined {profile.joinedAt}
                </span>
                {favoriteGameLabel && (
                  <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-0.5 text-xs text-cyan-200">
                    Favorite: {favoriteGameLabel}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="relative mt-6">
            <ProgressBar
              value={xpPct}
              label={`Level ${profile.level} → ${profile.level + 1}`}
              hint={`${profile.xp.toLocaleString()} / ${profile.xpToNext.toLocaleString()} XP`}
            />
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <StatCard label="Wins" value={profile.wins} tone="emerald" />
          <StatCard label="Losses" value={profile.losses} tone="rose" />
          <StatCard label="Win Rate" value={`${winPct}%`} tone="cyan" />
          <StatCard
            label="Best Streak"
            value={profile.bestStreak}
            tone="amber"
          />
        </section>

        <section>
          <div className="mb-4 flex items-center gap-2 border-b border-white/10">
            <TabButton
              active={tab === "achievements"}
              onClick={() => setTab("achievements")}
            >
              Achievements
            </TabButton>
            <TabButton
              active={tab === "history"}
              onClick={() => setTab("history")}
            >
              Match History
            </TabButton>
          </div>

          {tab === "achievements" ? (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ACHIEVEMENT_CATALOG.map((a) => {
                const unlocked = unlockedIds.has(a.id);
                return (
                  <li
                    key={a.id}
                    className={`rounded-2xl border bg-gradient-to-br p-4 transition-all duration-200 hover:-translate-y-0.5 ${rarityClass(a.rarity)} ${
                      unlocked ? "" : "opacity-60"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden
                        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/40 text-2xl ${
                          unlocked ? "" : "grayscale"
                        }`}
                      >
                        {a.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-bold text-white">
                            {a.title}
                          </div>
                          <span className="text-[10px] uppercase tracking-widest text-gray-400">
                            {rarityLabel(a.rarity)}
                          </span>
                        </div>
                        <div className="mt-0.5 text-xs text-gray-400">
                          {a.description}
                        </div>
                        {unlocked && (
                          <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                            ✓ Unlocked
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <ul className="divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/5">
              {matches.length === 0 ? (
                <li className="px-6 py-8 text-center text-sm text-gray-400">
                  No matches recorded yet. Play a few games to build history.
                </li>
              ) : (
                matches.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-white/5 sm:px-6"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold ${
                          m.result === "win"
                            ? "bg-emerald-400/15 text-emerald-300"
                            : m.result === "draw"
                              ? "bg-cyan-400/15 text-cyan-300"
                              : "bg-rose-400/15 text-rose-300"
                        }`}
                      >
                        {m.result === "win"
                          ? "W"
                          : m.result === "draw"
                            ? "D"
                            : "L"}
                      </span>
                      <div>
                        <div className="text-sm font-semibold text-white">
                          vs {m.opponentName}
                        </div>
                        <div className="text-xs text-gray-400">
                          {listGames().find((g) => g.id === m.gameId)?.mode ??
                            m.gameId}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm text-gray-200">
                        {m.scoreSelf} – {m.scoreOpponent}
                      </div>
                      <div
                        className={`text-xs ${
                          m.lpDelta >= 0 ? "text-emerald-300" : "text-rose-300"
                        }`}
                      >
                        {m.lpDelta >= 0 ? "+" : ""}
                        {m.lpDelta} LP · {timeAgo(m.createdAt)}
                      </div>
                    </div>
                  </li>
                ))
              )}
            </ul>
          )}
        </section>

        {isOwn && (
          <div className="text-center">
            <Link
              href="/games"
              className="inline-flex items-center gap-2 rounded-2xl bg-cyan-400 px-6 py-3 text-sm font-bold text-black transition-all duration-200 hover:-translate-y-0.5 hover:bg-cyan-300 hover:shadow-[0_0_28px_-2px_rgba(34,211,238,0.9)]"
            >
              Queue up
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function ProfileSkeleton() {
  return (
    <main className="page-enter app-aurora min-h-[calc(100vh-4rem)] bg-gradient-to-br from-black via-slate-950 to-cyan-950 px-4 py-8 text-white sm:px-6 sm:py-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <div className="h-28 w-28 animate-shimmer rounded-full bg-white/5" />
            <div className="flex-1 space-y-3">
              <div className="h-3 w-24 animate-shimmer rounded-md bg-white/5" />
              <div className="h-10 w-2/3 animate-shimmer rounded-md bg-white/5" />
              <div className="h-3 w-3/4 animate-shimmer rounded-md bg-white/5" />
            </div>
          </div>
        </section>
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 w-full animate-shimmer rounded-2xl border border-white/10 bg-white/5"
            />
          ))}
        </section>
      </div>
    </main>
  );
}
