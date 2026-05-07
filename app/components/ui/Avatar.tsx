function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) {
    const p = parts[0];
    return (p[0] + (p[1] ?? "")).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const sizeClass = {
  sm: "h-8 w-8 text-xs",
  md: "h-12 w-12 text-base",
  lg: "h-20 w-20 text-2xl",
  xl: "h-28 w-28 text-4xl",
} as const;

const gradients = [
  "from-cyan-400 to-blue-600",
  "from-fuchsia-400 to-violet-700",
  "from-emerald-400 to-teal-700",
  "from-amber-400 to-rose-700",
  "from-sky-400 to-indigo-700",
  "from-rose-400 to-fuchsia-700",
] as const;

function pickGradient(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return gradients[h % gradients.length];
}

type Props = {
  name: string;
  size?: keyof typeof sizeClass;
  glow?: boolean;
  className?: string;
};

export function Avatar({ name, size = "md", glow = false, className = "" }: Props) {
  const grad = pickGradient(name);
  return (
    <span
      aria-label={name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-extrabold text-white ${grad} ${sizeClass[size]} ${
        glow
          ? "shadow-[0_0_24px_-4px_rgba(34,211,238,0.7)] ring-2 ring-cyan-400/40"
          : ""
      } ${className}`}
    >
      {initials(name)}
    </span>
  );
}
