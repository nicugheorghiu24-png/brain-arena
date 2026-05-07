type Row = { rank: number; name: string; tier: string; lp: number; you?: boolean };

const rows: Row[] = [
  { rank: 1, name: "Vex", tier: "Master", lp: 4120 },
  { rank: 2, name: "Echo", tier: "Master", lp: 3890 },
  { rank: 3, name: "Zenith", tier: "Diamond I", lp: 3050 },
  { rank: 4, name: "PixelHawk", tier: "Diamond I", lp: 2730 },
  { rank: 5, name: "you", tier: "Diamond II", lp: 2480, you: true },
];

export default function LeaderboardPreview() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Leaderboard</h2>
        <span className="text-xs uppercase tracking-widest text-gray-400">
          Top 5
        </span>
      </div>

      <ul className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.rank}
            className={`flex items-center justify-between rounded-xl px-3 py-2 transition-colors ${
              r.you
                ? "border border-cyan-400/40 bg-cyan-400/10"
                : "hover:bg-white/5"
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`w-6 text-right font-mono text-sm ${
                  r.rank === 1
                    ? "text-yellow-300"
                    : r.rank === 2
                      ? "text-gray-300"
                      : r.rank === 3
                        ? "text-amber-500"
                        : "text-gray-500"
                }`}
              >
                #{r.rank}
              </span>
              <span
                className={`text-sm font-semibold ${
                  r.you ? "text-cyan-200" : "text-white"
                }`}
              >
                {r.name}
              </span>
              <span className="text-xs text-gray-400">{r.tier}</span>
            </div>
            <span className="font-mono text-sm text-gray-300">{r.lp} LP</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
