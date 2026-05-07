import { localDb } from "./local";
import { prismaDb } from "./prisma";
import type { Db } from "./types";

function isPrismaConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Backend router. Returns the active Db implementation based on env.
 *
 * - DATABASE_URL set → Prisma backend (Postgres). Run
 *   `npm run db:migrate:dev` first to apply schema.
 * - Otherwise → local backend (browser localStorage). The app remains
 *   fully usable for development without spinning up Postgres.
 *
 * Pages and components must import `db` from this barrel and never
 * reach into a specific backend file directly.
 */
export const db: Db = isPrismaConfigured() ? prismaDb : localDb;

export type {
  Db,
  ProfileRecord,
  MatchRecord,
  LeaderboardRow,
  LeaderboardSort,
  AchievementUnlock,
  DbBackendId,
} from "./types";
