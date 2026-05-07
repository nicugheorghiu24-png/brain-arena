type Props = {
  value: string;
  flipped: boolean;
  matched: boolean;
  disabled: boolean;
  onClick: () => void;
};

export function MemoryCard({
  value,
  flipped,
  matched,
  disabled,
  onClick,
}: Props) {
  const showFace = flipped || matched;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || matched || flipped}
      aria-label={showFace ? `Card: ${value}` : "Hidden card"}
      aria-pressed={showFace}
      className={`group relative aspect-square w-full select-none [perspective:600px] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 ${
        matched
          ? "cursor-default"
          : flipped
            ? "cursor-default"
            : disabled
              ? "cursor-not-allowed opacity-90"
              : "cursor-pointer hover:-translate-y-0.5 transition-transform duration-200"
      }`}
    >
      <div
        className={`absolute inset-0 rounded-xl [transform-style:preserve-3d] transition-transform duration-500 ${
          showFace
            ? "[transform:rotateY(0deg)]"
            : "[transform:rotateY(180deg)]"
        }`}
      >
        {/* Face-up */}
        <div
          className={`absolute inset-0 flex items-center justify-center rounded-xl border [backface-visibility:hidden] text-3xl sm:text-5xl ${
            matched
              ? "border-emerald-400/60 bg-emerald-500/15 shadow-[0_0_28px_-6px_rgba(52,211,153,0.7)]"
              : "border-cyan-400/40 bg-gradient-to-br from-cyan-500/15 to-fuchsia-500/10 shadow-[0_0_24px_-10px_rgba(34,211,238,0.6)]"
          }`}
        >
          <span className={matched ? "" : "drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]"}>
            {value}
          </span>
        </div>

        {/* Face-down */}
        <div className="absolute inset-0 flex items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-950 to-black [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <span
            aria-hidden
            className="absolute inset-2 rounded-lg border border-cyan-400/10"
          />
          <span
            aria-hidden
            className="absolute inset-3 rounded-md border border-cyan-400/5"
          />
          <span className="relative font-mono text-2xl font-extrabold text-cyan-300/30 sm:text-3xl">
            ?
          </span>
        </div>
      </div>
    </button>
  );
}
