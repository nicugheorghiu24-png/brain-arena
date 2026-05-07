import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

const RATE_LIMIT = 10; // requests
const WINDOW_MS = 60 * 1000; // 1 minute

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIP = request.headers.get("x-real-ip");
  const clientIP = request.headers.get("x-client-ip");
  return forwarded?.split(",")[0] || realIP || clientIP || "unknown";
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
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

export function middleware(request: NextRequest) {
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