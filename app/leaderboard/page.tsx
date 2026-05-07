"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  getServerUser,
  getUser,
  subscribeUser,
} from "../lib/fakeAuth";
import { TierBadge } from "../components/ui/TierBadge";
import { Avatar } from "../components/ui/Avatar";
import { db, type LeaderboardRow, type LeaderboardSort } from "../lib/db";

const REGIONS = ["All", "EU", "NA", "AS"] as const;
const SORTS: { id: LeaderboardSort; label: string }[] = [
  { id: "mmr", label: "MMR" },
  { id: "wins", label: "Wins" },
  { id: "winrate", label: "Win %" },
];

type Region = (typeof REGIONS)[number];

export default function LeaderboardPage() {
  const viewer = useSyncExternalStore(subscribeUser, getUser, getServerUser);
  const youUserId = viewer?.email ?? null;

  const [region, setRegion] = useState<Region>("All");
  const [sort, setSort] = useState<LeaderboardSort>("mmr");
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(async () => {
      setLoading(true);
      const out = await db.leaderboard.list({
        sort,
        region: region === "All" ? undefined : region,
        youUserId,
        limit: 50,
      });
      if (cancelled) return;
      setRows(out);
      setLoading(false);
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [sort, region, youUserId]);

  // Re-rank within current sort/region selection.
  const ranked = useMemo(
    () => rows.map((r, i) => ({ ...r, rank: i + 1 })),
    [rows],
  );
  const top3 = ranked.slice(0, 3);
  const rest = ranked.slice(3);

  return (
    <main className="page-enter app-aurora min-h-[calc(100vh-4rem)] bg-gradient-to-br from-black via-slate-950 to-cyan-950 px-4 py-8 text-white sm:px-6 sm:py-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-cyan-300/70">
              Global Rankings
            </p>
            <h1 className="mt-1 text-4xl font-extrabold md:text-5xl">
              Leaderboard
            </h1>
            <p className="mt-2 text-sm text-gray-400">
              Top minds in the arena. Sortable by skill metric.
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div
              role="tablist"
              aria-label="Sort"
              className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1 backdrop-blur"
            >
              {SORTS.map((s) => (
                <button
                  key={s.id}
                  role="tab"
                  aria-selected={sort === s.id}
                  onClick={() => setSort(s.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    sort === s.id
                      ? "bg-cyan-400/20 text-cyan-200 shadow-[0_0_18px_-6px_rgba(34,211,238,0.7)]"
                      : "text-gray-400 hover:text-cyan-200"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div
              role="tablist"
              aria-label="Region filter"
              className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1 backdrop-blur"
            >
              {REGIONS.map((r) => (
                <button
                  key={r}
                  role="tab"
                  aria-selected={region === r}
                  onClick={() => setRegion(r)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    region === r
                      ? "bg-cyan-400/20 text-cyan-200 shadow-[0_0_18px_-6px_rgba(34,211,238,0.7)]"
                      : "text-gray-400 hover:text-cyan-200"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </header>

        {loading ? (
          <PodiumSkeleton />
        ) : (
          top3.length >= 3 && (
            <div className="grid gap-4 sm:grid-cols-3">
              {[top3[1], top3[0], top3[2]].map((p, i) => {
                const place = i === 1 ? 1 : i === 0 ? 2 : 3;
                const tone =
                  place === 1
                    ? "from-yellow-400/30 to-yellow-400/0 border-yellow-400/50 shadow-[0_0_50px_-10px_rgba(250,204,21,0.5)]"
                    : place === 2
                      ? "from-slate-300/20 to-slate-300/0 border-slate-300/40"
                      : "from-amber-600/20 to-amber-600/0 border-amber-600/40";
                return (
                  <Link
                    key={p.username}
                    href={`/profile/${encodeURIComponent(p.username)}`}
                    className={`relative overflow-hidden rounded-2xl border bg-gradient-to-b ${tone} p-6 backdrop-blur transition-all hover:-translate-y-1 ${
                      place === 1 ? "sm:-translate-y-3" : ""
                    } animate-float`}
                    style={{ animationDelay: `${i * 0.4}s` }}
                  >
                    <div className="flex flex-col items-center gap-3 text-center">
                      <div className="text-5xl">
                        {place === 1 ? "🥇" : place === 2 ? "🥈" : "🥉"}
                      </div>
                      <Avatar
                        name={p.username}
                        size="lg"
                        glow={place === 1}
                      />
                      <div>
                        <div className="text-lg font-extrabold text-white">
                          {p.username}
                        </div>
                        <TierBadge
                          tier={p.tier}
                          division={p.division}
                          size="sm"
                        />
                      </div>
                      <div className="font-mono text-2xl font-bold text-cyan-200">
                        {p.lp.toLocaleString()}{" "}
                        <span className="text-xs text-gray-400">LP</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )
        )}

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
          <div className="hidden border-b border-white/5 bg-white/5 px-6 py-3 text-xs uppercase tracking-widest text-gray-400 md:grid md:grid-cols-[60px_1fr_140px_120px_120px_100px]">
            <span>Rank</span>
            <span>Player</span>
            <span>Tier</span>
            <span className="text-right">W / L</span>
            <span className="text-right">Win %</span>
            <span className="text-right">LP</span>
          </div>
          {loading ? (
            <ul className="divide-y divide-white/5">
              {Array.from({ length: 10 }).map((_, i) => (
                <li
                  key={i}
                  className="h-14 animate-shimmer bg-white/[0.02]"
                />
              ))}
            </ul>
          ) : (
            <ul className="divide-y divide-white/5">
              {rest.map((p) => {
                const total = p.wins + p.losses;
                const winPct = total
                  ? Math.round((p.wins / total) * 100)
                  : 0;
                return (
                  <li
                    key={`${p.userId}-${p.rank}`}
                    className={`grid items-center gap-3 px-4 py-3 transition-colors hover:bg-white/5 sm:px-6 md:grid-cols-[60px_1fr_140px_120px_120px_100px] ${
                      p.isYou
                        ? "bg-cyan-400/10 ring-1 ring-inset ring-cyan-400/30"
                        : ""
                    }`}
                  >
                    <span
                      className={`font-mono text-sm ${
                        p.isYou ? "text-cyan-200" : "text-gray-400"
                      }`}
                    >
                      #{p.rank}
                    </span>
                    <Link
                      href={`/profile/${encodeURIComponent(p.username)}`}
                      className="flex items-center gap-3 hover:text-cyan-200"
                    >
                      <Avatar
                        name={p.username}
                        size="sm"
                        glow={p.isYou}
                      />
                      <div className="min-w-0">
                        <div
                          className={`truncate text-sm font-semibold ${
                            p.isYou ? "text-cyan-100" : "text-white"
                          }`}
                        >
                          {p.username}{" "}
                          {p.isYou && (
                            <span className="text-xs font-normal text-cyan-300/80">
                              (you)
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 md:hidden">
                          {p.tier} {p.division} · {p.lp} LP
                        </div>
                      </div>
                    </Link>
                    <div className="hidden md:block">
                      <TierBadge
                        tier={p.tier}
                        division={p.division}
                        size="sm"
                      />
                    </div>
                    <span className="hidden text-right font-mono text-sm text-gray-300 md:block">
                      {p.wins} / {p.losses}
                    </span>
                    <span className="hidden text-right font-mono text-sm text-emerald-300 md:block">
                      {winPct}%
                    </span>
                    <span className="hidden text-right font-mono text-sm text-cyan-200 md:block">
                      {p.lp}
                    </span>
                  </li>
                );
              })}
              {rest.length === 0 && (
                <li className="px-6 py-8 text-center text-sm text-gray-400">
                  No players found in this region.
                </li>
              )}
            </ul>
          )}
        </div>

        <div className="text-center">
          <Link
            href="/games"
            className="inline-flex items-center gap-2 rounded-2xl bg-cyan-400 px-6 py-3 text-sm font-bold text-black transition-all duration-200 hover:-translate-y-0.5 hover:bg-cyan-300 hover:shadow-[0_0_28px_-2px_rgba(34,211,238,0.9)]"
          >
            Climb the ranks → Choose a game
          </Link>
        </div>
      </div>
    </main>
  );
}

function PodiumSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-56 w-full animate-shimmer rounded-2xl border border-white/10 bg-white/5"
        />
      ))}
    </div>
  );
}
