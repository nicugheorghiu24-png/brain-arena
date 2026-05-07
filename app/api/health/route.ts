import { NextResponse } from "next/server";

export const runtime = "nodejs";
// Always render fresh — health is a probe, not a cached doc.
export const dynamic = "force-dynamic";

const STARTED_AT = Date.now();

/**
 * Liveness probe.
 *
 * Returns 200 as long as the Node process is responsive. Does NOT
 * touch the database — a DB outage should not cause Cloudflare /
 * orchestrators to consider the app dead and restart it.
 *
 * Use /api/healthz for readiness (DB-aware) checks.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      uptimeSec: Math.floor((Date.now() - STARTED_AT) / 1000),
      ts: new Date().toISOString(),
    },
    { status: 200 },
  );
}
