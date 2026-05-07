type ProgressBarProps = {
  value: number;
  label?: string;
  hint?: string;
  size?: "sm" | "md";
  className?: string;
};

export function ProgressBar({
  value,
  label,
  hint,
  size = "md",
  className = "",
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const heightClass = size === "sm" ? "h-1.5" : "h-2";

  return (
    <div className={`w-full ${className}`}>
      {(label || hint) && (
        <div className="mb-1.5 flex items-baseline justify-between text-xs">
          {label && <span className="text-gray-300">{label}</span>}
          {hint && <span className="font-mono text-gray-500">{hint}</span>}
        </div>
      )}
      <div
        className={`w-full overflow-hidden rounded-full bg-white/10 ${heightClass}`}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.7)] transition-[width] duration-700"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
