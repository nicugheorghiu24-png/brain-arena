"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../AuthProvider";
import { FAKE_MATCH_HISTORY } from "../../lib/fakeData";
import { listGames } from "../../games/registry";

type ApiMatch = {
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
};

type Row = {
  id: string;
  opponent: string;
  mode: string;
  result: "W" | "L" | "D";
  scoreText: string;
  delta: number;
  when: string;
};

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

function fromApi(m: ApiMatch): Row {
  const meta = listGames().find((g) => g.id === m.gameId);
  return {
    id: m.id,
    opponent: m.opponentName,
    mode: meta?.mode ?? m.gameId,
    result: m.result === "win" ? "W" : m.result === "draw" ? "D" : "L",
    scoreText: `${m.scoreSelf}-${m.scoreOpponent}`,
    delta: m.lpDelta,
    when: timeAgo(new Date(m.createdAt).getTime()),
  };
}

const FALLBACK: Row[] = FAKE_MATCH_HISTORY.map((m) => ({
  id: m.id,
  opponent: m.opponent,
  mode: m.mode,
  result: m.result,
  scoreText: `${m.myScore}-${m.oppScore}`,
  delta: m.delta,
  when: m.timestamp,
}));

export default function MatchHistory() {
  const { user } = useAuth();
  const userKey = user?.id ?? null;

  const [rows, setRows] = useState<Row[]>(FALLBACK);
  const [usingReal, setUsingReal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!userKey) {
        setRows(FALLBACK);
        setUsingReal(false);
        return;
      }
      try {
        const res = await fetch("/api/matches?limit=5", {
          credentials: "include",
        });
        if (!res.ok) {
          setRows(FALLBACK);
          setUsingReal(false);
          return;
        }
        const data = (await res.json()) as {
          ok: boolean;
          matches: ApiMatch[];
        };
        if (cancelled) return;
        if (data.matches.length > 0) {
          setRows(data.matches.map(fromApi));
          setUsingReal(true);
        } else {
          setRows(FALLBACK);
          setUsingReal(false);
        }
      } catch {
        if (cancelled) return;
        setRows(FALLBACK);
        setUsingReal(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userKey]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Recent Matches</h2>
        <span className="text-xs uppercase tracking-widest text-gray-400">
          {usingReal ? `Last ${rows.length}` : "Demo · play to fill"}
        </span>
      </div>

      <ul className="divide-y divide-white/5">
        {rows.map((m) => (
          <li
            key={m.id}
            className="flex items-center justify-between gap-3 py-3 transition-colors hover:bg-white/5"
          >
            <div className="flex items-center gap-3">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold ${
                  m.result === "W"
                    ? "bg-emerald-400/15 text-emerald-300"
                    : m.result === "D"
                      ? "bg-cyan-400/15 text-cyan-300"
                      : "bg-rose-400/15 text-rose-300"
                }`}
              >
                {m.result}
              </span>
              <div>
                <div className="text-sm font-semibold text-white">
                  vs {m.opponent}
                </div>
                <div className="text-xs text-gray-400">{m.mode}</div>
              </div>
            </div>

            <div className="text-right">
              <div className="text-sm font-mono text-gray-200">
                {m.scoreText}
              </div>
              <div
                className={`text-xs ${
                  m.delta >= 0 ? "text-emerald-300" : "text-rose-300"
                }`}
              >
                {m.delta >= 0 ? "+" : ""}
                {m.delta} LP · {m.when}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
