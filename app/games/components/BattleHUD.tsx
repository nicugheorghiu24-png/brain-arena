import { Avatar } from "../../components/ui/Avatar";
import { TierBadge } from "../../components/ui/TierBadge";
import type { DuelScore, PlayerInfo } from "../types";

type Props = {
  you: PlayerInfo;
  opponent: PlayerInfo;
  score: DuelScore;
  round?: { current: number; total: number };
  status?: string;
  category?: string;
};

export function BattleHUD({
  you,
  opponent,
  score,
  round,
  status,
  category,
}: Props) {
  const showStatusRow = round || status || category;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-6">
        <PlayerPanel info={you} score={score.self} />
        <PlayerPanel info={opponent} score={score.opponent} />
      </div>

      {showStatusRow && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 backdrop-blur">
          {round ? (
            <span className="text-xs uppercase tracking-widest text-gray-400">
              Round {round.current} / {round.total}
            </span>
          ) : (
            <span aria-hidden />
          )}
          {category ? (
            <span className="text-xs font-mono text-cyan-200">
              {category.toUpperCase()}
            </span>
          ) : (
            <span aria-hidden />
          )}
          {status ? (
            <span className="text-xs uppercase tracking-widest text-gray-400">
              {status}
            </span>
          ) : (
            <span aria-hidden />
          )}
        </div>
      )}
    </>
  );
}

function PlayerPanel({
  info,
  score,
}: {
  info: PlayerInfo;
  score: number;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border bg-white/5 p-3 backdrop-blur sm:p-4 ${
        info.isYou
          ? "border-cyan-400/40 shadow-[0_0_24px_-12px_rgba(34,211,238,0.6)]"
          : "border-fuchsia-400/30"
      }`}
    >
      <Avatar name={info.name} size="md" glow={info.isYou} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold text-white">
          {info.name}
          {info.isYou && (
            <span className="ml-2 text-xs font-normal text-cyan-300/80">
              (you)
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <TierBadge tier={info.tier} division={info.division} size="sm" />
        </div>
      </div>
      <div
        className={`font-mono text-3xl font-extrabold ${
          info.isYou ? "text-cyan-200" : "text-fuchsia-200"
        }`}
      >
        {score}
      </div>
    </div>
  );
}
