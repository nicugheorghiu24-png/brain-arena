"use client";

import {
  signIn as fakeSignIn,
  signOut as fakeSignOut,
  type FakeUser,
} from "../fakeAuth";
import { db } from "../db";

export type AuthUser = FakeUser;

export type AuthResult = { ok: true } | { ok: false; reason: string };

const PASSWORD_MIN = 6;

export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN) {
    return `Password must be at least ${PASSWORD_MIN} characters.`;
  }
  return null;
}

export function validateUsername(username: string): string | null {
  const trimmed = username.trim();
  if (trimmed.length < 3) return "Username must be at least 3 characters.";
  if (trimmed.length > 20) return "Username must be at most 20 characters.";
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    return "Username may contain letters, numbers, underscore, hyphen.";
  }
  return null;
}

export function validateEmail(email: string): string | null {
  if (!email.includes("@") || email.length < 5) return "Invalid email.";
  return null;
}

type ApiOutcome =
  | { ok: true; user: { id: string; email: string; username: string } }
  | { ok: false; reason: string }
  | { fallback: true };

async function callAuthApi(path: string, body: unknown): Promise<ApiOutcome> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "include",
    });
  } catch {
    // Network down or no API → fall back to local fakeAuth.
    return { fallback: true };
  }
  if (res.status === 503) {
    // Backend not configured (no DATABASE_URL) — local fallback.
    return { fallback: true };
  }
  let data: { ok?: boolean; reason?: string; user?: ApiOutcome extends { ok: true; user: infer U } ? U : never };
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) {
    return { ok: false, reason: data.reason ?? "Request failed." };
  }
  if (!data.user) {
    return { fallback: true };
  }
  return { ok: true, user: data.user };
}

/**
 * Sign in. Tries the server API (real session via HTTP-only cookie);
 * if the API isn't available (no DATABASE_URL or network error) falls
 * back to the local fakeAuth flow so dev still works without Postgres.
 */
export async function signInWithEmail(
  email: string,
  password: string,
): Promise<AuthResult> {
  const emailErr = validateEmail(email);
  if (emailErr) return { ok: false, reason: emailErr };
  const pwErr = validatePassword(password);
  if (pwErr) return { ok: false, reason: pwErr };

  const api = await callAuthApi("/api/auth/login", { email, password });
  if ("fallback" in api) {
    fakeSignIn({ email });
    await db.profiles.ensureForUser({
      userId: email,
      username: email.split("@")[0],
      email,
    });
    return { ok: true };
  }
  if (!api.ok) return api;
  // Mirror to local so client UI updates instantly.
  fakeSignIn({
    email: api.user.email,
    username: api.user.username,
    id: api.user.id,
  });
  return { ok: true };
}

export async function signUpWithEmail(opts: {
  email: string;
  password: string;
  username: string;
}): Promise<AuthResult> {
  const usernameErr = validateUsername(opts.username);
  if (usernameErr) return { ok: false, reason: usernameErr };
  const emailErr = validateEmail(opts.email);
  if (emailErr) return { ok: false, reason: emailErr };
  const pwErr = validatePassword(opts.password);
  if (pwErr) return { ok: false, reason: pwErr };

  const trimmed = opts.username.trim();
  const api = await callAuthApi("/api/auth/signup", {
    email: opts.email,
    password: opts.password,
    username: trimmed,
  });
  if ("fallback" in api) {
    fakeSignIn({ email: opts.email, username: trimmed });
    await db.profiles.ensureForUser({
      userId: opts.email,
      username: trimmed,
      email: opts.email,
    });
    return { ok: true };
  }
  if (!api.ok) return api;
  fakeSignIn({
    email: api.user.email,
    username: api.user.username,
    id: api.user.id,
  });
  return { ok: true };
}

export async function signOut() {
  // Best-effort server logout (clears HTTP-only cookie).
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // ignore
  }
  fakeSignOut();
}
