const KEY = "brain-arena-user";
const EVENT = "brain-arena-user-change";

export type FakeUser = {
  email: string;
  username?: string;
  /** Server user id when signed in via the real API. */
  id?: string;
};

function emit() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENT));
}

export function signIn(user: FakeUser) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(user));
  emit();
}

export function signOut() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
  emit();
}

// useSyncExternalStore requires getSnapshot to return a stable reference
// when the underlying state hasn't changed. We cache the parsed user keyed
// on the raw localStorage string so repeated calls return the same object
// reference until something writes.
let cachedRaw: string | null = null;
let cachedUser: FakeUser | null = null;
let initialized = false;

export function getUser(): FakeUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(KEY);
  if (initialized && raw === cachedRaw) return cachedUser;
  initialized = true;
  cachedRaw = raw;
  if (!raw) {
    cachedUser = null;
    return null;
  }
  try {
    cachedUser = JSON.parse(raw) as FakeUser;
  } catch {
    cachedUser = null;
  }
  return cachedUser;
}

export function subscribeUser(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function getServerUser(): FakeUser | null {
  return null;
}
