type Props = {
  yourName: string;
  opponentName: string;
  hint?: string;
  mode?: string;
};

export function IntroSplash({
  yourName,
  opponentName,
  hint = "Locking in arena…",
  mode,
}: Props) {
  return (
    <main className="page-enter app-aurora flex min-h-[calc(100vh-4rem)] items-center justify-center bg-gradient-to-br from-black via-slate-950 to-cyan-950 px-4 text-white">
      <div className="text-center">
        <div className="text-xs uppercase tracking-widest text-cyan-300/80">
          {mode ? mode : "Match found"}
        </div>
        <h1 className="mt-2 text-4xl font-extrabold sm:text-6xl">
          <span className="text-cyan-300">{yourName}</span>
          <span className="mx-3 text-gray-500">vs</span>
          <span className="text-fuchsia-300">{opponentName}</span>
        </h1>
        <p className="mt-3 text-sm text-gray-400 animate-float">{hint}</p>
      </div>
    </main>
  );
}
