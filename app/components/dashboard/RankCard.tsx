const rank = {
  tier: "Diamond",
  division: "II",
  points: 2480,
  next: 2600,
};

export default function RankCard() {
  const progress = Math.min(
    100,
    Math.round((rank.points / rank.next) * 100),
  );

  return (
    <div className="relative overflow-hidden rounded-2xl border border-cyan-400/30 bg-gradient-to-br from-cyan-500/10 via-slate-900 to-black p-6 shadow-[0_0_60px_-30px_rgba(34,211,238,0.7)]">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-cyan-400/20 blur-3xl"
      />

      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-cyan-300/80">
            Current Rank
          </div>
          <div className="mt-1 text-3xl font-extrabold text-white">
            {rank.tier}{" "}
            <span className="text-cyan-300">{rank.division}</span>
          </div>
        </div>
        <div className="rounded-full border border-cyan-400/40 bg-black/40 px-3 py-1 text-sm text-cyan-200">
          {rank.points} LP
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-2 flex justify-between text-xs text-gray-400">
          <span>Progress to Diamond I</span>
          <span>
            {rank.points} / {rank.next}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.8)]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
