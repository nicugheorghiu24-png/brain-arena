import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  contained?: boolean;
};

/**
 * Page shell for any in-game route. Provides the cyber gradient,
 * animated entry, and a contained max-width body. Pass contained={false}
 * for full-bleed game UIs (e.g., a centered intro splash).
 */
export function GameLayout({
  children,
  className = "",
  contained = true,
}: Props) {
  return (
    <main
      className={`page-enter app-aurora min-h-[calc(100vh-4rem)] bg-gradient-to-br from-black via-slate-950 to-cyan-950 px-4 py-6 text-white sm:px-6 sm:py-8 ${className}`}
    >
      {contained ? (
        <div className="mx-auto flex max-w-5xl flex-col gap-6">{children}</div>
      ) : (
        children
      )}
    </main>
  );
}
