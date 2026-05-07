import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { requirePrisma, isDbConfigured, DbNotConfiguredError } from "../prisma";

const SESSION_COOKIE = "ba_session";
const SESSION_TTL_DAYS = 30;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
const BCRYPT_COST = 12;

export const SESSION_COOKIE_NAME = SESSION_COOKIE;

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
    secure: process.env.NODE_ENV === "production",
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

/**
 * Resolve the current authenticated user from the session cookie.
 * Returns null when the request is anonymous, the session is expired,
 * or the database is not configured.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (!isDbConfigured()) return null;
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const prisma = requirePrisma();
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: { include: { profile: true } } },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { token } }).catch(() => {});
    return null;
  }
  if (!session.user.profile) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    username: session.user.profile.username,
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
