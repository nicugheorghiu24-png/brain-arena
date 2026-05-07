import { ProgressBar } from "../ui/ProgressBar";

type Props = {
  level: number;
  xp: number;
  xpToNext: number;
};

export function XPCard({ level, xp, xpToNext }: Props) {
  const pct = Math.round((xp / xpToNext) * 100);
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/40 bg-cyan-400/10 text-sm font-extrabold text-cyan-200 shadow-[0_0_18px_-4px_rgba(34,211,238,0.7)]">
            {level}
          </span>
          <div>
            <div className="text-xs uppercase tracking-widest text-gray-400">
              Level
            </div>
            <div className="text-lg font-bold text-white">
              Level {level}{" "}
              <span className="text-sm font-medium text-gray-400">
                · {pct}% to {level + 1}
              </span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-widest text-gray-400">
            XP
          </div>
          <div className="font-mono text-sm text-cyan-200">
            {xp.toLocaleString()} / {xpToNext.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <ProgressBar value={pct} />
      </div>
    </div>
  );
}
