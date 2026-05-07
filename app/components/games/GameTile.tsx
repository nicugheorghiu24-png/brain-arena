import Link from "next/link";
import type { GameMeta, MatchMode } from "../../games/types";
import type { Difficulty } from "../../games/questions/types";

type Variant = "hub" | "compact";

type Props = {
  game: GameMeta;
  variant?: Variant;
  href?: string;
  className?: string;
};

const DIFFICULTY_TONE: Record<Difficulty, string> = {
  easy: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  medium: "border-cyan-400/40 bg-cyan-400/10 text-cyan-200",
  hard: "border-amber-400/40 bg-amber-400/10 text-amber-200",
  expert: "border-fuchsia-400/40 bg-fuchsia-400/10 text-fuchsia-200",
};

const MODE_BADGE: Record<MatchMode, { label: string; className: string }> = {
  ranked: {
    label: "Ranked",
    className:
      "border-cyan-400/50 bg-cyan-500/15 text-cyan-200 shadow-[0_0_18px_-6px_rgba(34,211,238,0.6)]",
  },
  casual: {
    label: "Casual",
    className: "border-violet-400/40 bg-violet-500/10 text-violet-200",
  },
  both: {
    label: "Ranked · Casual",
    className: "border-cyan-400/40 bg-cyan-400/10 text-cyan-200",
  },
};

// Faked online-now counters until matchmaking is real.
const PLAYER_COUNT_RANGE: Record<string, [number, number]> = {
  quiz: [180, 320],
  memory: [120, 220],
  reaction: [60, 140],
  math: [90, 170],
  chess: [80, 140],
};

function fakePlayerCount(gameId: string): number {
  const [lo, hi] = PLAYER_COUNT_RANGE[gameId] ?? [50, 150];
  // Stable seeded count per gameId so the number doesn't flicker on
  // re-render — uses the gameId char codes, not Math.random.
  let h = 0;
  for (let i = 0; i < gameId.length; i++) h = (h * 31 + gameId.charCodeAt(i)) >>> 0;
  return lo + (h % (hi - lo + 1));
}

export function GameTile({
  game,
  variant = "hub",
  href = `/matchmaking?game=${game.id}`,
  className = "",
}: Props) {
  const playerCount = fakePlayerCount(game.id);

  if (variant === "compact") {
    return (
      <Link
        href={href}
        className={`group relative overflow-hidden rounded-2xl border border-cyan-400/30 bg-gradient-to-br from-slate-900 via-cyan-950/40 to-black p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-400/60 hover:shadow-[0_0_28px_-8px_rgba(34,211,238,0.6)] ${className}`}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-3 -right-3 h-12 w-12 rounded-full bg-cyan-400/10 blur-xl transition-colors duration-300 group-hover:bg-cyan-400/30"
        />
        <div className="relative">
          <div className="text-2xl">{game.icon}</div>
          <div className="mt-1 text-sm font-extrabold text-white">
            {game.label}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-cyan-300/60">
            Play now
          </div>
        </div>
      </Link>
    );
  }

  const modeBadge = MODE_BADGE[game.matchMode ?? "casual"];
  const difficultyTone = game.defaultDifficulty
    ? DIFFICULTY_TONE[game.defaultDifficulty]
    : null;

  return (
    <Link
      href={href}
      className={`group relative flex h-full flex-col overflow-hidden rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-slate-900 via-cyan-950/30 to-black p-6 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-400/60 hover:shadow-[0_0_50px_-12px_rgba(34,211,238,0.7)] sm:p-7 ${className}`}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-10 -right-10 h-44 w-44 rounded-full bg-cyan-400/10 blur-3xl transition-all duration-500 group-hover:scale-110 group-hover:bg-cyan-400/30"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -left-10 -top-10 h-28 w-28 rounded-full bg-fuchsia-500/5 blur-3xl"
      />

      <div className="relative flex flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-500/10 text-3xl shadow-[0_0_22px_-6px_rgba(34,211,238,0.6)]">
            {game.icon}
          </span>
          <div className="flex flex-col items-end gap-1">
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${modeBadge.className}`}
            >
              {modeBadge.label}
            </span>
            {difficultyTone && (
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${difficultyTone}`}
              >
                {game.defaultDifficulty}
              </span>
            )}
          </div>
        </div>

        <div className="mt-4 flex-1">
          <h3 className="text-2xl font-extrabold text-white">{game.label}</h3>
          <p className="mt-2 text-sm text-gray-400">{game.description}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]" />
              {playerCount.toLocaleString()} online
            </span>
            <span>·</span>
            <span>{game.category}</span>
            <span>·</span>
            <span>~{game.avgDurationSec}s</span>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end">
          <span className="inline-flex items-center gap-1 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-bold text-black transition-transform duration-200 group-hover:translate-x-0.5 group-hover:bg-cyan-300">
            Play →
          </span>
        </div>
      </div>
    </Link>
  );
}
