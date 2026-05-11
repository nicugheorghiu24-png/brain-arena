import Link from "next/link";
import { Avatar } from "../../components/ui/Avatar";
import type { AchievementRecord } from "../../lib/games/achievements-catalog";
import type { MatchMilestones } from "../../lib/matchClient";
import type { DuelScore, MatchResult, RewardSummary } from "../types";

type Props = {
  result: MatchResult;
  yourName: string;
  opponentName: string;
  score: DuelScore;
  reward?: RewardSummary;
  /**
   * Milestones the server reports for this match — first win ever,
   * tier promotion, level up, new streak record. When present and
   * any flag is true, ResultScreen renders a banner above the play
   * controls. Null/undefined → no banner (e.g., the API call
   * fell back to local mode, or none triggered).
   */
  milestones?: MatchMilestones | null;
  /**
   * Achievements freshly unlocked by this match — only fresh ones,
   * never previously-held ones. ResultScreen renders each as a chip
   * with icon + title. Empty array → no chips.
   */
  achievementsUnlocked?: AchievementRecord[];
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
  milestones,
  achievementsUnlocked,
  playAgainHref = "/matchmaking",
  homeHref = "/dashboard",
  className = "",
}: Props) {
  const won = result === "win";
  const tied = result === "draw";
  const milestoneLabels = milestonesToLabels(milestones);
  const showAchievements =
    achievementsUnlocked !== undefined && achievementsUnlocked.length > 0;

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

      {milestoneLabels.length > 0 && (
        <div className="mt-5 rounded-2xl border border-amber-400/40 bg-gradient-to-r from-amber-500/15 via-amber-400/10 to-orange-500/15 px-4 py-3 text-left">
          <div className="text-xs uppercase tracking-widest text-amber-200">
            Milestones
          </div>
          <ul className="mt-1 flex flex-wrap gap-2">
            {milestoneLabels.map((m) => (
              <li
                key={m.key}
                className="flex items-center gap-1.5 rounded-full border border-amber-300/40 bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-100"
              >
                <span aria-hidden>{m.icon}</span>
                {m.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {showAchievements && (
        <div className="mt-4 rounded-2xl border border-fuchsia-400/40 bg-gradient-to-r from-fuchsia-500/15 via-violet-500/10 to-cyan-500/15 px-4 py-3 text-left">
          <div className="text-xs uppercase tracking-widest text-fuchsia-200">
            Achievement{achievementsUnlocked!.length > 1 ? "s" : ""} unlocked
          </div>
          <ul className="mt-2 flex flex-col gap-2">
            {achievementsUnlocked!.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-3 rounded-xl border border-fuchsia-300/30 bg-fuchsia-400/10 px-3 py-2"
              >
                <span aria-hidden className="text-2xl">
                  {a.icon}
                </span>
                <div className="flex-1">
                  <div className="text-sm font-extrabold text-white">
                    {a.title}
                  </div>
                  <div className="text-xs text-fuchsia-100/80">
                    {a.description}
                  </div>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-fuchsia-200/80">
                  {a.rarity}
                </span>
              </li>
            ))}
          </ul>
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

function milestonesToLabels(
  m: MatchMilestones | null | undefined,
): Array<{ key: string; icon: string; label: string }> {
  if (!m) return [];
  const out: Array<{ key: string; icon: string; label: string }> = [];
  if (m.firstWinEver) out.push({ key: "first", icon: "🏆", label: "First win" });
  if (m.tierPromoted) out.push({ key: "tier", icon: "📈", label: "Promoted" });
  if (m.leveledUp) out.push({ key: "level", icon: "⬆️", label: "Level up" });
  if (m.newStreakRecord)
    out.push({ key: "streak", icon: "🔥", label: "New streak record" });
  return out;
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
