import { getUser } from "../../lib/fakeAuth";
import type { Question, SeenMap } from "./types";

const STORAGE_PREFIX = "brain-arena:seen:";
const ANON_KEY = "brain-arena:anon-id";
const PRUNE_DAYS = 90; // older than this is pruned regardless
const DEFAULT_FILTER_DAYS = 60;

function userKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

/**
 * Resolve a stable user id for the seen-history.
 * - Signed-in: the user's email
 * - Anonymous: a per-device id stored in localStorage
 * - SSR / no window: null (caller skips persistence)
 */
export function getCurrentUserId(): string | null {
  if (typeof window === "undefined") return null;
  const u = getUser();
  if (u?.email) return u.email;
  let anon = window.localStorage.getItem(ANON_KEY);
  if (!anon) {
    // Random suffix only used to identify the browser, never to influence
    // gameplay. Date.now() and Math.random() here run in browser only,
    // and only once per device (then cached).
    anon = `anon-${Date.now().toString(36)}-${Math.floor(
      Math.random() * 0xffffff,
    ).toString(36)}`;
    window.localStorage.setItem(ANON_KEY, anon);
  }
  return anon;
}

export function getSeenQuestions(userId: string | null): SeenMap {
  if (!userId) return {};
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(userKey(userId));
    return raw ? (JSON.parse(raw) as SeenMap) : {};
  } catch {
    return {};
  }
}

export function markQuestionsAsSeen(
  userId: string | null,
  questions: Question[],
): void {
  if (!userId) return;
  if (typeof window === "undefined") return;
  if (questions.length === 0) return;

  const now = Date.now();
  const map = getSeenQuestions(userId);
  for (const q of questions) {
    map[q.id] = now;
  }

  // Prune anything older than PRUNE_DAYS so storage doesn't grow forever.
  const pruneCutoff = now - PRUNE_DAYS * 24 * 60 * 60 * 1000;
  for (const k of Object.keys(map)) {
    if (map[k] < pruneCutoff) delete map[k];
  }

  try {
    window.localStorage.setItem(userKey(userId), JSON.stringify(map));
  } catch {
    // localStorage quota errors are non-fatal — the player just loses
    // anti-repeat protection until next session.
  }
}

export function filterRecentlySeenQuestions(
  userId: string | null,
  questions: Question[],
  days: number = DEFAULT_FILTER_DAYS,
): Question[] {
  if (!userId) return questions;
  const map = getSeenQuestions(userId);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return questions.filter((q) => {
    const t = map[q.id];
    return t === undefined || t < cutoff;
  });
}

export function isRecentlySeen(
  userId: string | null,
  hash: string,
  days: number = DEFAULT_FILTER_DAYS,
): boolean {
  if (!userId) return false;
  const map = getSeenQuestions(userId);
  const t = map[hash];
  if (t === undefined) return false;
  return t >= Date.now() - days * 24 * 60 * 60 * 1000;
}

export const SEEN_FILTER_DAYS = DEFAULT_FILTER_DAYS;
