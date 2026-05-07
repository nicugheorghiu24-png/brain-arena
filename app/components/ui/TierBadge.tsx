import type { Tier } from "../../lib/types";

type Style = { ring: string; text: string; bg: string; glow: string };

const tierColors: Record<Tier, Style> = {
  Bronze: {
    ring: "border-amber-700/60",
    text: "text-amber-400",
    bg: "bg-amber-700/10",
    glow: "",
  },
  Silver: {
    ring: "border-slate-300/60",
    text: "text-slate-200",
    bg: "bg-slate-400/10",
    glow: "",
  },
  Gold: {
    ring: "border-yellow-400/70",
    text: "text-yellow-300",
    bg: "bg-yellow-400/10",
    glow: "shadow-[0_0_18px_-4px_rgba(250,204,21,0.6)]",
  },
  Platinum: {
    ring: "border-teal-300/60",
    text: "text-teal-200",
    bg: "bg-teal-400/10",
    glow: "shadow-[0_0_18px_-4px_rgba(45,212,191,0.6)]",
  },
  Diamond: {
    ring: "border-cyan-300/70",
    text: "text-cyan-200",
    bg: "bg-cyan-400/10",
    glow: "shadow-[0_0_22px_-4px_rgba(34,211,238,0.8)]",
  },
  Master: {
    ring: "border-fuchsia-300/70",
    text: "text-fuchsia-200",
    bg: "bg-fuchsia-400/10",
    glow: "shadow-[0_0_24px_-4px_rgba(232,121,249,0.85)]",
  },
};

type Props = {
  tier: Tier;
  division?: string;
  size?: "sm" | "md";
  className?: string;
};

export function TierBadge({
  tier,
  division,
  size = "md",
  className = "",
}: Props) {
  const c = tierColors[tier];
  const padding = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-bold ${padding} ${c.ring} ${c.bg} ${c.text} ${c.glow} ${className}`}
    >
      {tier}
      {division && <span className="opacity-70">{division}</span>}
    </span>
  );
}
