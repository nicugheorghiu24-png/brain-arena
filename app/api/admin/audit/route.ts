import { NextResponse } from "next/server";
import { requirePrisma, isDbConfigured } from "../../../lib/prisma";
import { requireAdmin, AdminUnauthorized } from "../../../lib/auth/admin";

export const runtime = "nodejs";

const ALLOWED_CATEGORIES = new Set([
  "chess_timing",
  "abandon",
  "replay",
  "rate_limit",
  "ban",
]);
const ALLOWED_SEVERITIES = new Set(["info", "warn", "alert"]);

export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AdminUnauthorized) {
      return NextResponse.json({ ok: false, reason: err.message }, { status: 401 });
    }
    throw err;
  }
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: true, events: [] });
  }

  const url = new URL(req.url);
  const limit = Math.min(
    Math.max(Number.parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 1),
    500,
  );
  const cat = url.searchParams.get("category");
  const sev = url.searchParams.get("severity");
  const sinceParam = url.searchParams.get("since"); // ISO date

  const where: {
    category?: string;
    severity?: string;
    createdAt?: { gte: Date };
  } = {};
  if (cat && ALLOWED_CATEGORIES.has(cat)) where.category = cat;
  if (sev && ALLOWED_SEVERITIES.has(sev)) where.severity = sev;
  if (sinceParam) {
    const since = new Date(sinceParam);
    if (!isNaN(since.getTime())) where.createdAt = { gte: since };
  }

  const prisma = requirePrisma();
  const events = await prisma.auditEvent.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({
    ok: true,
    events: events.map((e) => ({
      id: e.id,
      userId: e.userId,
      matchId: e.matchId,
      category: e.category,
      severity: e.severity,
      flags: e.flags,
      details: e.details,
      createdAt: e.createdAt.toISOString(),
    })),
  });
}
