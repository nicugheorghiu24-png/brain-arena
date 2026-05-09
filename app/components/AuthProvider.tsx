"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

export type AuthProfile = {
  tier: string;
  division: string;
  lp: number;
  level: number;
  xp: number;
  xpToNext: number;
  wins: number;
  losses: number;
  currentStreak: number;
  bestStreak: number;
  placementMatchesPlayed: number;
  isProvisional: boolean;
  abandonCount: number;
  region: string;
  bio: string;
  joinedAt: string;
  favoriteGameId: string | null;
};

export type AuthUser = {
  id: string;
  email: string;
  username: string;
  profile?: AuthProfile;
  unlockedAchievementIds?: string[];
};

type AuthContextValue = {
  user: AuthUser | null;
  refresh: () => Promise<void>;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ ok: true } | { ok: false; reason: string }>;
  signUp: (opts: {
    email: string;
    password: string;
    username: string;
  }) => Promise<{ ok: true } | { ok: false; reason: string }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Single source of truth for the authenticated user.
 *
 * The initial value is rendered server-side in the root layout via
 * getCurrentUserWithProfile(), so the first paint already has the right
 * navbar state — no flash of "logged out". After mount, refresh()
 * re-fetches /api/auth/me to reconcile any cookie-state drift (e.g.
 * cookie expired in another tab).
 *
 * signIn / signUp / signOut perform the API call and then call
 * refresh() so all consumers re-render with the new state in lockstep.
 */
export function AuthProvider({
  initialUser,
  children,
}: {
  initialUser: AuthUser | null;
  children: ReactNode;
}) {
  const [user, setUser] = useState<AuthUser | null>(initialUser);

  const refresh = useCallback(async () => {
    let res: Response;
    try {
      res = await fetch("/api/auth/me", {
        credentials: "include",
        cache: "no-store",
      });
    } catch {
      // Network error — keep current state. Don't log a healthy user
      // out because of a transient blip.
      return;
    }
    if (!res.ok) return;
    const data = (await res.json().catch(() => null)) as
      | { user: AuthUser | null }
      | null;
    setUser(data?.user ?? null);
  }, []);

  // No on-mount refresh: the server component in app/layout.tsx already
  // fetched the authoritative user via getCurrentUserWithProfile() and
  // passed it as initialUser, so the first client render is correct. We
  // keep refresh() exposed for after-action reconciliation (signIn,
  // signUp, signOut already call it; pages can too if they need to).

  const signIn = useCallback(
    async (email: string, password: string) => {
      let res: Response;
      try {
        res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email, password }),
        });
      } catch {
        return { ok: false as const, reason: "Network error." };
      }
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        reason?: string;
      };
      if (!res.ok || !data.ok) {
        return { ok: false as const, reason: data.reason ?? "Login failed." };
      }
      await refresh();
      return { ok: true as const };
    },
    [refresh],
  );

  const signUp = useCallback(
    async (opts: { email: string; password: string; username: string }) => {
      let res: Response;
      try {
        res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(opts),
        });
      } catch {
        return { ok: false as const, reason: "Network error." };
      }
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        reason?: string;
      };
      if (!res.ok || !data.ok) {
        return {
          ok: false as const,
          reason: data.reason ?? "Sign-up failed.",
        };
      }
      await refresh();
      return { ok: true as const };
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Even if the network logout fails, clear local state — the user
      // wants out and we'd rather over-clear than leave a stale view.
    }
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, refresh, signIn, signUp, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}
