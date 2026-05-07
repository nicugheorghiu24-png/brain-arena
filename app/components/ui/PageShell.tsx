import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  contained?: boolean;
};

export function PageShell({
  children,
  className = "",
  contained = true,
}: Props) {
  const inner = contained ? (
    <div className="mx-auto max-w-6xl space-y-8">{children}</div>
  ) : (
    children
  );

  return (
    <main
      className={`page-enter app-aurora min-h-[calc(100vh-4rem)] bg-gradient-to-br from-black via-slate-950 to-cyan-950 px-4 py-8 text-white sm:px-6 sm:py-10 ${className}`}
    >
      {inner}
    </main>
  );
}
