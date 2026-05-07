import Link from "next/link";
import { FAKE_ACHIEVEMENTS, rarityClass } from "../../lib/fakeData";

export function AchievementsTeaser() {
  const recent = FAKE_ACHIEVEMENTS.filter((a) => a.unlocked).slice(0, 4);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Recent achievements</h2>
        <Link
          href="/profile"
          className="text-xs font-semibold uppercase tracking-widest text-cyan-300 transition-colors hover:text-cyan-200"
        >
          View all →
        </Link>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {recent.map((a) => (
          <li
            key={a.id}
            className={`flex items-center gap-3 rounded-xl border bg-gradient-to-br p-3 ${rarityClass(a.rarity)}`}
          >
            <span
              aria-hidden
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/40 text-xl"
            >
              {a.icon}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-white">
                {a.title}
              </div>
              <div className="truncate text-xs text-gray-400">
                {a.description}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
