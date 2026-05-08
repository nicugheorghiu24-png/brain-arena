"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getServerUser,
  getUser,
  signIn,
  signOut,
  subscribeUser,
} from "../lib/fakeAuth";
import { useToast } from "./ui/Toast";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/games", label: "Games" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/profile", label: "Profile" },
] as const;

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const user = useSyncExternalStore(subscribeUser, getUser, getServerUser);
  const [open, setOpen] = useState(false);

  // Reconcile fakeAuth (localStorage display state) with the real
  // server session on mount. Two directions:
  //   1. Server has a valid session, localStorage doesn't → rehydrate.
  //   2. Server says no auth, localStorage has a stale user → clear it.
  // Without (2) the navbar shows "Hi, X" while every API call returns
  // 401, e.g. when the cookie was issued with Secure on an HTTP origin.
  // Network errors / 5xx responses leave the local state alone so a
  // transient outage doesn't appear to log the user out.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let res: Response;
      try {
        res = await fetch("/api/auth/me", { credentials: "include" });
      } catch {
        return; // network error — keep local state
      }
      if (cancelled) return;
      if (!res.ok) return; // 5xx — keep local state
      let data: { user: { id: string; email: string; username: string } | null };
      try {
        data = await res.json();
      } catch {
        return;
      }
      if (cancelled) return;
      if (data.user) {
        if (getUser()?.id !== data.user.id) {
          signIn({
            id: data.user.id,
            email: data.user.email,
            username: data.user.username,
          });
        }
      } else if (getUser()) {
        // Server explicitly says no authenticated user. Drop the stale
        // localStorage so navbar + protected routes agree.
        signOut();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const display = user?.username ?? user?.email?.split("@")[0] ?? null;

  function handleLogout() {
    signOut();
    toast.push({ type: "info", title: "Signed out" });
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-50 border-b border-cyan-400/10 bg-black/60 backdrop-blur-md">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 sm:py-4">
        <Link
          href="/"
          onClick={() => setOpen(false)}
          className="group flex items-center gap-2 text-lg font-bold tracking-wide text-cyan-400 transition-colors hover:text-cyan-300 sm:text-xl"
        >
          <span className="inline-block h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_12px_2px_rgba(34,211,238,0.7)] transition-transform group-hover:scale-125" />
          Brain Arena
        </Link>

        <ul className="hidden items-center gap-1 md:flex">
          {navLinks.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                className={`relative inline-block px-3 py-2 text-sm font-medium transition-colors duration-200 ${
                  isActive(href)
                    ? "text-cyan-300"
                    : "text-gray-300 hover:text-cyan-300"
                }`}
              >
                {label}
                <span
                  className={`absolute inset-x-3 -bottom-0.5 h-px origin-left bg-gradient-to-r from-cyan-400 to-transparent transition-transform duration-300 ${
                    isActive(href) ? "scale-x-100" : "scale-x-0"
                  }`}
                />
              </Link>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-3 md:flex">
          {display ? (
            <>
              <span className="hidden text-sm text-gray-300 lg:inline">
                Hi,{" "}
                <span className="font-semibold text-cyan-200">{display}</span>
              </span>
              <button
                onClick={handleLogout}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-gray-300 transition-all duration-200 hover:-translate-y-0.5 hover:border-rose-400/40 hover:bg-rose-500/10 hover:text-rose-200"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-xl border border-cyan-400/60 px-4 py-2 text-sm font-semibold text-cyan-300 transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-cyan-400/10 hover:shadow-[0_0_18px_-2px_rgba(34,211,238,0.6)]"
              >
                Login
              </Link>
              <Link
                href="/register"
                className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-bold text-black transition-all duration-200 hover:-translate-y-0.5 hover:bg-cyan-300 hover:shadow-[0_0_22px_-2px_rgba(34,211,238,0.9)]"
              >
                Register
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-cyan-300 transition-colors hover:border-cyan-400/40 hover:bg-white/5 md:hidden"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            {open ? (
              <>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </>
            ) : (
              <>
                <line x1="4" y1="7" x2="20" y2="7" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="17" x2="20" y2="17" />
              </>
            )}
          </svg>
        </button>
      </nav>

      {open && (
        <div className="border-t border-white/5 bg-black/80 backdrop-blur-md md:hidden">
          <ul className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3">
            {navLinks.map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  onClick={() => setOpen(false)}
                  className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive(href)
                      ? "bg-cyan-400/10 text-cyan-200"
                      : "text-gray-300 hover:bg-white/5 hover:text-cyan-200"
                  }`}
                >
                  {label}
                </Link>
              </li>
            ))}
            <li className="mt-2 border-t border-white/5 pt-3">
              {display ? (
                <button
                  onClick={() => {
                    setOpen(false);
                    handleLogout();
                  }}
                  className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm font-semibold text-gray-300 transition-colors hover:border-rose-400/40 hover:bg-rose-500/10 hover:text-rose-200"
                >
                  Logout ({display})
                </button>
              ) : (
                <div className="flex gap-2">
                  <Link
                    href="/login"
                    onClick={() => setOpen(false)}
                    className="flex-1 rounded-lg border border-cyan-400/60 px-3 py-2 text-center text-sm font-semibold text-cyan-300"
                  >
                    Login
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => setOpen(false)}
                    className="flex-1 rounded-lg bg-cyan-400 px-3 py-2 text-center text-sm font-bold text-black"
                  >
                    Register
                  </Link>
                </div>
              )}
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}
