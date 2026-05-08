type Props = {
  wins: number;
  losses: number;
  bestStreak: number;
};

export default function PlayerStats({ wins, losses, bestStreak }: Props) {
  const total = wins + losses;
  const winRatePct = total > 0 ? Math.round((wins / total) * 100) : 0;

  const stats = [
    { label: "Wins", value: wins.toString(), tone: "good" as const },
    { label: "Losses", value: losses.toString(), tone: "bad" as const },
    {
      label: "Win Rate",
      value: total > 0 ? `${winRatePct}%` : "—",
      tone: total > 0 && winRatePct >= 50 ? ("good" as const) : ("muted" as const),
    },
    {
      label: "Best Streak",
      value: bestStreak.toString(),
      tone: "muted" as const,
    },
  ];

  const toneClass = {
    good: "text-emerald-300",
    bad: "text-rose-300",
    muted: "text-cyan-200",
  };

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-2xl border border-white/10 bg-white/5 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-400/30 hover:bg-white/10"
        >
          <div className="text-xs uppercase tracking-widest text-gray-400">
            {s.label}
          </div>
          <div className={`mt-2 text-3xl font-bold ${toneClass[s.tone]}`}>
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}
