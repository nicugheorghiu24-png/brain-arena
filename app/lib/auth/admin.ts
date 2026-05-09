import "server-only";
import { headers } from "next/headers";

/**
 * Admin auth — env-token gated.
 *
 * Every admin endpoint pulls `await requireAdmin()` at the top. If the
 * request's `X-Admin-Token` header doesn't match the `ADMIN_TOKEN` env
 * var, the helper throws `AdminUnauthorized`; the route handler
 * catches it and responds 401.
 *
 * Intentionally simple. We do NOT layer this on top of getCurrentUser
 * — admin auth is a separate trust path so a regular user account
 * compromise doesn't grant admin powers. At M3 this becomes a real
 * RBAC layer; for beta a single shared secret is fine.
 *
 * The token never appears in URLs (header only) so it doesn't show up
 * in nginx access logs.
 *
 * Set on the VPS:
 *
 *   echo "ADMIN_TOKEN=$(openssl rand -hex 32)" >> /root/brain-arena/.env
 *   systemctl restart brain-arena.service
 *
 * Use:
 *
 *   curl -H "X-Admin-Token: $ADMIN_TOKEN" \
 *        https://playbrainarena.com/api/admin/users
 */

export class AdminUnauthorized extends Error {
  constructor() {
    super("Admin token required.");
    this.name = "AdminUnauthorized";
  }
}

export async function requireAdmin(): Promise<void> {
  const expected = process.env.ADMIN_TOKEN?.trim();
  if (!expected || expected.length < 16) {
    // Fail closed — without ADMIN_TOKEN set on the host, NO request
    // can be admin. This is the right default; a misconfigured prod
    // shouldn't accidentally expose the surface.
    throw new AdminUnauthorized();
  }
  const h = await headers();
  const provided = h.get("x-admin-token")?.trim();
  if (!provided) throw new AdminUnauthorized();

  // Constant-time-ish comparison. Token is ~64 chars hex; if lengths
  // differ we fail without leaking the expected length further than
  // we already do (the env value never leaves the server).
  if (provided.length !== expected.length) throw new AdminUnauthorized();
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  if (mismatch !== 0) throw new AdminUnauthorized();
}
