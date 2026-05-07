import { NextResponse } from "next/server";
import { getPrisma, isDbConfigured } from "../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Readiness probe.
 *
 * Returns 200 only if the DB is reachable. Used by deploy scripts and
 * any orchestrator that needs to wait until the app can serve real
 * requests (login, matchmaking persistence) before sending traffic.
 *
 * If the DB is intentionally unconfigured (local-only mode) we still
 * return 200 — the app is doing what it was told to do — but include
 * `db: "unconfigured"` so the caller can decide.
 */
export async function GET() {
  const dbConfigured = isDbConfigured();
  if (!dbConfigured) {
    return NextResponse.json(
      { status: "ok", db: "unconfigured" },
      { status: 200 },
    );
  }

  const prisma = getPrisma();
  if (!prisma) {
    return NextResponse.json(
      { status: "degraded", db: "unavailable" },
      { status: 503 },
    );
  }

  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return NextResponse.json(
      { status: "ok", db: "reachable" },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json(
      { status: "degraded", db: "error", reason: message },
      { status: 503 },
    );
  }
}
