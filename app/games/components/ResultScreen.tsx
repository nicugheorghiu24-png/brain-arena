import Link from "next/link";
import { Avatar } from "../../components/ui/Avatar";
import type { DuelScore, MatchResult, RewardSummary } from "../types";

type Props = {
  result: MatchResult;
  yourName: string;
  opponentName: string;
  score: DuelScore;
  reward?: RewardSummary;
  playAgainHref?: string;
  homeHref?: string;
  className?: string;
};

const TITLE: Record<MatchResult, string> = {
  win: "Victory",
  draw: "Draw",
  loss: "Defeat",
};

const HEADER_TONE: Record<MatchResult, string> = {
  win: "text-emerald-300",
  draw: "text-cyan-300",
  loss: "text-rose-300",
};

export function ResultScreen({
  result,
  yourName,
  opponentName,
  score,
  reward,
  playAgainHref = "/matchmaking",
  homeHref = "/dashboard",
  className = "",
}: Props) {
  const won = result === "win";
  const tied = result === "draw";

  return (
    <div
      className={`mx-auto w-full max-w-lg rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 via-slate-900 to-black p-8 text-center backdrop-blur ${className}`}
    >
      <div
        className={`text-xs uppercase tracking-widest ${HEADER_TONE[result]}`}
      >
        Match complete
      </div>
      <h1 className="mt-2 text-5xl font-extrabold">{TITLE[result]}</h1>

      <div className="mt-8 grid grid-cols-3 items-center gap-4">
        <div className="text-center">
          <Avatar name={yourName} size="lg" glow={won} />
          <div className="mt-2 text-sm font-semibold text-white">
            {yourName}
          </div>
          <div
            className={`mt-1 font-mono text-3xl font-extrabold ${
              won ? "text-emerald-300" : "text-gray-300"
            }`}
          >
            {score.self}
          </div>
        </div>
        <div className="text-2xl font-extrabold text-gray-500">VS</div>
        <div className="text-center">
          <Avatar name={opponentName} size="lg" glow={!won && !tied} />
          <div className="mt-2 text-sm font-semibold text-white">
            {opponentName}
          </div>
          <div
            className={`mt-1 font-mono text-3xl font-extrabold ${
              !won && !tied ? "text-rose-300" : "text-gray-300"
            }`}
          >
            {score.opponent}
          </div>
        </div>
      </div>

      {reward && (
        <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
          <RewardChip label="LP" value={reward.lpDelta} />
          <RewardChip label="XP" value={reward.xpGained} alwaysPositive />
        </div>
      )}

      <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link
          href={playAgainHref}
          className="rounded-xl bg-cyan-400 px-6 py-3 text-sm font-bold text-black transition-all duration-200 hover:-translate-y-0.5 hover:bg-cyan-300 hover:shadow-[0_0_24px_-2px_rgba(34,211,238,0.9)]"
        >
          Play again
        </Link>
        <Link
          href={homeHref}
          className="rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold text-gray-200 transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-400/40 hover:text-cyan-200"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}

function RewardChip({
  label,
  value,
  alwaysPositive = false,
}: {
  label: string;
  value: number;
  alwaysPositive?: boolean;
}) {
  const isPositive = alwaysPositive || value >= 0;
  const sign = value > 0 || alwaysPositive ? "+" : "";
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-left">
      <div className="text-xs uppercase tracking-widest text-gray-400">
        {label}
      </div>
      <div
        className={`text-lg font-extrabold ${
          isPositive ? "text-emerald-300" : "text-rose-300"
        }`}
      >
        {sign}
        {value}
      </div>
    </div>
  );
}
