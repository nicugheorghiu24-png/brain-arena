import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Simple in-memory rate limiter. Per-IP, per-process — fine for the
// single-replica beta deploy. For multi-replica we'd swap for a shared
// store (Redis / Upstash). The map is GC'd best-effort below.
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
let lastSweepAt = Date.now();
const SWEEP_INTERVAL_MS = 60 * 1000;

const RATE_LIMIT = 60; // requests per window — covers normal nav + repeated /api/auth/me
const WINDOW_MS = 60 * 1000; // 1 minute

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIP = request.headers.get("x-real-ip");
  const clientIP = request.headers.get("x-client-ip");
  return forwarded?.split(",")[0] || realIP || clientIP || "unknown";
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();

  // Best-effort sweep of expired entries so the map doesn't grow with
  // unique IPs over the lifetime of the process.
  if (now - lastSweepAt > SWEEP_INTERVAL_MS) {
    for (const [key, entry] of rateLimitMap.entries()) {
      if (now > entry.resetTime) rateLimitMap.delete(key);
    }
    lastSweepAt = now;
  }

  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + WINDOW_MS });
    return false;
  }

  if (entry.count >= RATE_LIMIT) {
    return true;
  }

  entry.count++;
  return false;
}

export function proxy(request: NextRequest) {
  const ip = getClientIP(request);

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429 }
    );
  }

  return NextResponse.next();
}

export const config = {
  // Rate-limit API routes EXCEPT health probes — Cloudflare/Docker hit
  // these once per ~10s per source and we don't want to false-positive
  // them out.
  matcher: ["/api/((?!health$|healthz$).*)"],
};