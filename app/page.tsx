import Link from "next/link";

const features = [
  { title: "1v1", body: "Dueluri rapide între jucători." },
  { title: "Rank", body: "Progresezi după performanță." },
  { title: "Skill", body: "Logică, reacție și memorie." },
] as const;

export default function Home() {
  return (
    <main className="page-enter app-aurora min-h-[calc(100vh-4rem)] bg-gradient-to-br from-black via-slate-950 to-cyan-950 text-white">
      <section className="flex min-h-[80vh] flex-col items-center justify-center px-6 text-center">
        <div className="mb-6 rounded-full border border-cyan-500/40 bg-cyan-500/5 px-4 py-2 text-sm text-cyan-300 shadow-[0_0_24px_-8px_rgba(34,211,238,0.6)]">
          Skill-based multiplayer battles
        </div>

        <h1 className="max-w-4xl text-5xl font-extrabold leading-tight md:text-7xl">
          Câștigă prin logică, viteză și inteligență
        </h1>

        <p className="mt-6 max-w-2xl text-lg text-gray-300">
          Intră în arene rapide, joacă împotriva altor oameni și urcă în clasament.
          Fără noroc. Doar abilitate.
        </p>

        <div className="mt-10 flex flex-col gap-4 sm:flex-row">
          <Link
            href="/games"
            className="rounded-2xl bg-cyan-400 px-8 py-4 text-lg font-bold text-black transition-all duration-200 hover:-translate-y-0.5 hover:bg-cyan-300 hover:shadow-[0_0_28px_-2px_rgba(34,211,238,0.9)]"
          >
            Play Now
          </Link>

          <Link
            href="/leaderboard"
            className="rounded-2xl border border-white/20 px-8 py-4 text-lg font-bold text-white transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-300/60 hover:bg-white/10 hover:text-cyan-200"
          >
            Vezi clasamentul
          </Link>
        </div>

        <div className="mt-16 grid w-full max-w-4xl gap-4 md:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-white/10 bg-white/5 p-6 transition-all duration-200 hover:-translate-y-1 hover:border-cyan-400/40 hover:bg-white/10 hover:shadow-[0_0_30px_-10px_rgba(34,211,238,0.5)]"
            >
              <div className="text-3xl font-bold text-cyan-400 transition-colors group-hover:text-cyan-300">
                {f.title}
              </div>
              <p className="mt-2 text-gray-400 group-hover:text-gray-300">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
