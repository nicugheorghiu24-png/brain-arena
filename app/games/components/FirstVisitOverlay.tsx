"use client";

import { useEffect, useState } from "react";

/**
 * First-visit guidance overlay for /games.
 *
 * Shows once per browser/device (gated by a localStorage flag). The
 * goal is to give brand-new players the mental model they need before
 * their first match — what LP and tiers mean, that bots are clearly
 * labeled, and that every game is 1v1 skill-only. After dismissal it
 * never re-appears unless localStorage is cleared.
 *
 * Renders nothing on the server (and during the very first paint, until
 * we've read localStorage). That keeps the page server-componented and
 * avoids hydration flashes.
 */

const STORAGE_KEY = "ba_games_seen_intro_v1";

export function FirstVisitOverlay() {
  // `null` = haven't checked localStorage yet → render nothing. This
  // means SSR + the first client paint are identical (no overlay), and
  // we only flip to `true` after reading localStorage on mount.
  const [show, setShow] = useState<boolean | null>(null);

  useEffect(() => {
    // Deferred so setState isn't synchronous in the effect body
    // (codebase pattern, satisfies react-hooks/set-state-in-effect).
    const id = setTimeout(() => {
      try {
        const seen = window.localStorage.getItem(STORAGE_KEY);
        setShow(seen !== "1");
      } catch {
        // localStorage blocked (private mode, etc.) — fail open and
        // skip the overlay rather than spamming it every visit.
        setShow(false);
      }
    }, 0);
    return () => clearTimeout(id);
  }, []);

  function dismiss() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Ignore; the in-memory state below still dismisses for this tab.
    }
    setShow(false);
  }

  if (show !== true) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ba-first-visit-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-4 pb-6 pt-10 backdrop-blur-sm sm:items-center sm:p-6"
    >
      <div className="relative w-full max-w-lg rounded-3xl border border-cyan-400/30 bg-gradient-to-br from-slate-900 via-slate-950 to-black p-6 shadow-[0_0_80px_-20px_rgba(34,211,238,0.6)] sm:p-8">
        <div className="text-xs uppercase tracking-widest text-cyan-300/70">
          Welcome to Brain Arena
        </div>
        <h2
          id="ba-first-visit-title"
          className="mt-1 text-3xl font-extrabold text-white sm:text-4xl"
        >
          Three things to know
        </h2>
        <ul className="mt-5 space-y-4 text-sm text-slate-200 sm:text-base">
          <li className="flex gap-3">
            <span aria-hidden className="text-2xl">
              ⚔️
            </span>
            <div>
              <div className="font-bold text-white">
                Every game is 1v1, skill-only.
              </div>
              <div className="text-slate-300">
                No luck, no pay-to-win. Solo modes pit you against an AI;
                Chess matches you with another player.
              </div>
            </div>
          </li>
          <li className="flex gap-3">
            <span aria-hidden className="text-2xl">
              📈
            </span>
            <div>
              <div className="font-bold text-white">
                LP climbs you up tiers.
              </div>
              <div className="text-slate-300">
                Bronze → Silver → Gold → Platinum → Diamond. Your first 5
                matches are placement — LP changes 1.5×.
              </div>
            </div>
          </li>
          <li className="flex gap-3">
            <span aria-hidden className="text-2xl">
              🏆
            </span>
            <div>
              <div className="font-bold text-white">
                Win streaks unlock achievements.
              </div>
              <div className="text-slate-300">
                Check your profile after a match — milestones and
                achievements pop up when you cross thresholds.
              </div>
            </div>
          </li>
        </ul>
        <button
          type="button"
          onClick={dismiss}
          className="mt-7 w-full rounded-2xl bg-cyan-400 px-6 py-3 text-sm font-bold text-black transition-all duration-200 hover:-translate-y-0.5 hover:bg-cyan-300 hover:shadow-[0_0_30px_-4px_rgba(34,211,238,0.8)] sm:text-base"
        >
          Got it — let me play
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full p-2 text-slate-400 transition hover:bg-white/5 hover:text-white"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
