import { NextResponse } from "next/server";
import { isDbConfigured } from "../../lib/prisma";
import { getCurrentUser } from "../../lib/auth/server";
import { leaderboardService } from "../../lib/services/leaderboard";

export const runtime = "nodejs";

const ALLOWED_SORTS = new Set(["mmr", "xp", "wins", "winrate"] as const);
type Sort = "mmr" | "xp" | "wins" | "winrate";

const ALLOWED_REGIONS = new Set(["EU", "NA", "AS", "SA", "OC", "AF"]);

export async function GET(req: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: true, rows: [], you: null });
  }

  const url = new URL(req.url);
  const sortParam = url.searchParams.get("sort") ?? "mmr";
  const sort: Sort = ALLOWED_SORTS.has(sortParam as Sort)
    ? (sortParam as Sort)
    : "mmr";

  const regionParam = url.searchParams.get("region");
  const region =
    regionParam && ALLOWED_REGIONS.has(regionParam) ? regionParam : undefined;

  const limitRaw = Number.parseInt(
    url.searchParams.get("limit") ?? "50",
    10,
  );
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(limitRaw, 1), 100)
    : 50;

  const profiles = await leaderboardService.list({ sort, region, limit });
  const me = await getCurrentUser();
  return NextResponse.json({
    ok: true,
    you: me?.id ?? null,
    rows: profiles.map((p) => ({
      userId: p.userId,
      username: p.username,
      tier: p.tier,
      division: p.division,
      lp: p.lp,
      wins: p.wins,
      losses: p.losses,
      region: p.region,
    })),
  });
}
