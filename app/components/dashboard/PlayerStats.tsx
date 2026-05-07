type Stat = { label: string; value: string; tone?: "good" | "bad" | "muted" };

const stats: Stat[] = [
  { label: "Wins", value: "127", tone: "good" },
  { label: "Losses", value: "43", tone: "bad" },
  { label: "Win Rate", value: "74%", tone: "good" },
  { label: "Best Streak", value: "12", tone: "muted" },
];

const toneClass: Record<NonNullable<Stat["tone"]>, string> = {
  good: "text-emerald-300",
  bad: "text-rose-300",
  muted: "text-cyan-200",
};

export default function PlayerStats() {
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
          <div
            className={`mt-2 text-3xl font-bold ${
              toneClass[s.tone ?? "muted"]
            }`}
          >
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}
