import { listGames } from "./registry";
import { GameTile } from "../components/games/GameTile";

export default function GamesPage() {
  const games = listGames();

  return (
    <main className="page-enter app-aurora min-h-[calc(100vh-4rem)] bg-gradient-to-br from-black via-slate-950 to-cyan-950 px-4 py-8 text-white sm:px-6 sm:py-10">
      <div className="mx-auto max-w-6xl space-y-10">
        <header className="text-center">
          <p className="text-xs uppercase tracking-widest text-cyan-300/70">
            Game Hub
          </p>
          <h1 className="mt-1 text-4xl font-extrabold md:text-5xl">
            Choose your arena
          </h1>
          <p className="mt-3 text-sm text-gray-400 sm:text-base">
            Skill-based duels. Pick your weapon — every game is 1 vs 1, no luck.
          </p>
        </header>

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((g, i) => (
            <li
              key={g.id}
              className="page-enter"
              style={{ animationDelay: `${80 + i * 90}ms` }}
            >
              <GameTile game={g} variant="hub" />
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
