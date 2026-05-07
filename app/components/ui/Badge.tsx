import type { ReactNode } from "react";

type Tone = "cyan" | "emerald" | "rose" | "amber" | "violet" | "slate";

const tones: Record<Tone, string> = {
  cyan: "border-cyan-400/40 bg-cyan-400/10 text-cyan-200",
  emerald: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  rose: "border-rose-400/40 bg-rose-400/10 text-rose-200",
  amber: "border-amber-400/40 bg-amber-400/10 text-amber-200",
  violet: "border-violet-400/40 bg-violet-400/10 text-violet-200",
  slate: "border-slate-400/40 bg-slate-400/10 text-slate-200",
};

export function Badge({
  tone = "cyan",
  children,
  className = "",
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
