import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import { requirePrisma, isDbConfigured, DbNotConfiguredError } from "../prisma";

const SESSION_COOKIE = "ba_session";
const SESSION_TTL_DAYS = 30;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
const BCRYPT_COST = 12;

export const SESSION_COOKIE_NAME = SESSION_COOKIE;

/**
 * Decide whether the session cookie should carry the `Secure` flag.
 * The flag means "browser only sends this cookie over HTTPS" — so we
 * MUST set it to false on a deploy that serves plain HTTP, otherwise
 * the cookie is silently dropped by the browser and every subsequent
 * /api/auth/me returns null even though the user "logged in".
 *
 * Source of truth: PUBLIC_ORIGIN. If every comma-separated origin is
 * https://, the deployment is fully on HTTPS and Secure is safe.
 * If any origin is http://, drop Secure so the cookie remains usable.
 * If PUBLIC_ORIGIN is not set, fall back to NODE_ENV — preserves the
 * old default for dev (false) and a strict prod (true) that hasn't
 * been configured yet.
 */
function shouldUseSecureCookie(): boolean {
  const raw = process.env.PUBLIC_ORIGIN?.trim();
  if (!raw) return process.env.NODE_ENV === "production";
  const origins = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (origins.length === 0) return process.env.NODE_ENV === "production";
  return origins.every((o) => o.toLowerCase().startsWith("https://"));
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string): Promise<string> {
  const prisma = requirePrisma();
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { token, userId, expiresAt } });
  return token;
}

export async function setSessionCookie(token: string): Promise<void> {
  const c = await cookies();
  c.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function clearSessionCookie(): Promise<void> {
  const c = await cookies();
  c.delete(SESSION_COOKIE);
}

export type CurrentUser = {
  id: string;
  email: string;
  username: string;
};

export type CurrentUserWithProfile = CurrentUser & {
  profile: {
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
  /**
   * Catalog ids of achievements the user has unlocked. The catalog
   * itself is in app/lib/services/achievements.ts:ACHIEVEMENT_CATALOG
   * — clients render against the catalog using these ids.
   */
  unlockedAchievementIds: string[];
};

/**
 * Resolve the current authenticated user from the session cookie.
 * Returns null when the request is anonymous, the session is expired,
 * or the database is not configured.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const full = await getCurrentUserWithProfile();
  if (!full) return null;
  return { id: full.id, email: full.email, username: full.username };
}

/**
 * Same as getCurrentUser but returns the profile fields too. Used by
 * /api/auth/me so the dashboard can render real progression in one
 * round-trip instead of a follow-up profile fetch.
 */
export async function getCurrentUserWithProfile(): Promise<CurrentUserWithProfile | null> {
  if (!isDbConfigured()) return null;
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const prisma = requirePrisma();
  const session = await prisma.session.findUnique({
    where: { token },
    include: {
      user: {
        include: {
          profile: true,
          achievements: { select: { achievementId: true } },
        },
      },
    },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { token } }).catch(() => {});
    return null;
  }
  if (!session.user.profile) return null;
  // Banned users are treated as logged out at the auth layer. The
  // session row is not deleted (admin can still see who tried) — but
  // every protected route returns 401 for them.
  if (session.user.bannedAt) return null;
  const p = session.user.profile;
  return {
    id: session.user.id,
    email: session.user.email,
    username: p.username,
    profile: {
      tier: p.tier,
      division: p.division,
      lp: p.lp,
      level: p.level,
      xp: p.xp,
      xpToNext: p.xpToNext,
      wins: p.wins,
      losses: p.losses,
      currentStreak: p.currentStreak,
      bestStreak: p.bestStreak,
      placementMatchesPlayed: p.placementMatchesPlayed,
      isProvisional: p.placementMatchesPlayed < 5,
      abandonCount: p.abandonCount,
      region: p.region,
      bio: p.bio,
      joinedAt: p.joinedAt.toISOString(),
      favoriteGameId: p.favoriteGameId,
    },
    unlockedAchievementIds: session.user.achievements.map((a) => a.achievementId),
  };
}

/** Throws DbNotConfiguredError if the DB is offline; otherwise returns the user or null. */
export async function getCurrentUserStrict(): Promise<CurrentUser | null> {
  if (!isDbConfigured()) throw new DbNotConfiguredError();
  return getCurrentUser();
}

export async function deleteCurrentSession(): Promise<void> {
  if (!isDbConfigured()) return;
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  if (token) {
    const prisma = requirePrisma();
    await prisma.session.delete({ where: { token } }).catch(() => {});
  }
  await clearSessionCookie();
}

/**
 * Server-side input validation matching the client. Kept here so API
 * routes have an authoritative source of truth.
 */
export function validateSignupInput(input: unknown):
  | { ok: true; data: { email: string; password: string; username: string } }
  | { ok: false; reason: string } {
  if (typeof input !== "object" || input === null) {
    return { ok: false, reason: "Invalid payload." };
  }
  const { email, password, username } = input as Record<string, unknown>;
  if (typeof email !== "string" || !email.includes("@") || email.length < 5) {
    return { ok: false, reason: "Invalid email." };
  }
  if (typeof password !== "string" || password.length < 6) {
    return { ok: false, reason: "Password must be at least 6 characters." };
  }
  if (
    typeof username !== "string" ||
    username.trim().length < 3 ||
    username.trim().length > 20 ||
    !/^[A-Za-z0-9_-]+$/.test(username.trim())
  ) {
    return {
      ok: false,
      reason:
        "Username: 3–20 chars, letters/numbers/underscore/hyphen only.",
    };
  }
  return {
    ok: true,
    data: {
      email: email.toLowerCase().trim(),
      password,
      username: username.trim(),
    },
  };
}

export function validateLoginInput(input: unknown):
  | { ok: true; data: { email: string; password: string } }
  | { ok: false; reason: string } {
  if (typeof input !== "object" || input === null) {
    return { ok: false, reason: "Invalid payload." };
  }
  const { email, password } = input as Record<string, unknown>;
  if (typeof email !== "string" || !email.includes("@")) {
    return { ok: false, reason: "Invalid email." };
  }
  if (typeof password !== "string" || password.length < 1) {
    return { ok: false, reason: "Password required." };
  }
  return {
    ok: true,
    data: { email: email.toLowerCase().trim(), password },
  };
}
