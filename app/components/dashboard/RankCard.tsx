type Props = {
  tier: string;
  division: string;
  lp: number;
};

// Tier thresholds mirror lib/services/profiles.ts:tierForLp.
// We use them here only to draw the "next tier" progress bar.
const TIER_NEXT: Record<string, number | null> = {
  Bronze: 600,
  Silver: 900,
  Gold: 1200,
  Platinum: 1500,
  Diamond: 2000,
  Master: null,
};

export default function RankCard({ tier, division, lp }: Props) {
  const nextLp = TIER_NEXT[tier] ?? null;
  const progress =
    nextLp !== null && nextLp > 0
      ? Math.min(100, Math.max(0, Math.round((lp / nextLp) * 100)))
      : 100;
  const nextLabel =
    nextLp === null
      ? "At apex tier"
      : tier === "Bronze"
        ? "Progress to Silver"
        : tier === "Silver"
          ? "Progress to Gold"
          : tier === "Gold"
            ? "Progress to Platinum"
            : tier === "Platinum"
              ? "Progress to Diamond"
              : "Progress to Master";

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
            {tier} <span className="text-cyan-300">{division}</span>
          </div>
        </div>
        <div className="rounded-full border border-cyan-400/40 bg-black/40 px-3 py-1 text-sm text-cyan-200">
          {lp} LP
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-2 flex justify-between text-xs text-gray-400">
          <span>{nextLabel}</span>
          {nextLp !== null && (
            <span>
              {lp} / {nextLp}
            </span>
          )}
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
