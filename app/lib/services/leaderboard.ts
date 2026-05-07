import { Prisma } from "@prisma/client";
import { requirePrisma } from "../prisma";

export type LeaderboardSort = "mmr" | "xp" | "wins" | "winrate";

type Opts = {
  sort?: LeaderboardSort;
  region?: string;
  limit?: number;
};

export const leaderboardService = {
  /**
   * Live leaderboard derived from Profile rows. Sortable by MMR (lp),
   * XP, raw wins, or win-rate (computed via raw SQL because Prisma's
   * generated `orderBy` does not support derived expressions).
   */
  async list(opts: Opts = {}) {
    const prisma = requirePrisma();
    const sort: LeaderboardSort = opts.sort ?? "mmr";
    const limit = opts.limit ?? 50;
    const region = opts.region;

    if (sort === "winrate") {
      // Win-rate isn't a stored column, so we compute it via raw SQL
      // and then bind back to Profile rows.
      const where = region ? Prisma.sql`WHERE region = ${region}` : Prisma.empty;
      type Row = { userId: string };
      const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT "userId"
        FROM profiles
        ${where}
        ORDER BY (CAST(wins AS FLOAT) / NULLIF(wins + losses, 0)) DESC NULLS LAST,
                 lp DESC
        LIMIT ${limit}
      `);
      const profiles = await prisma.profile.findMany({
        where: { userId: { in: rows.map((r) => r.userId) } },
      });
      const byId = new Map(profiles.map((p) => [p.userId, p] as const));
      return rows.map((r) => byId.get(r.userId)).filter((p): p is NonNullable<typeof p> => p !== undefined);
    }

    const orderBy: Prisma.ProfileOrderByWithRelationInput =
      sort === "mmr"
        ? { lp: "desc" }
        : sort === "xp"
          ? { xp: "desc" }
          : { wins: "desc" };

    return prisma.profile.findMany({
      where: region ? { region } : undefined,
      orderBy,
      take: limit,
    });
  },
};
