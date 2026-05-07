"use client";

export default function PlayNowCTA() {
  return (
    <button
      type="button"
      onClick={() => {
        alert("Matchmaking coming soon — fake mode for now.");
      }}
      className="group relative w-full overflow-hidden rounded-2xl bg-cyan-400 px-8 py-5 text-lg font-extrabold text-black transition-all duration-200 hover:-translate-y-0.5 hover:bg-cyan-300 hover:shadow-[0_0_36px_-2px_rgba(34,211,238,0.95)]"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover:translate-x-full"
      />
      Play Now
    </button>
  );
}
