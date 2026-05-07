import { PrismaClient } from "@prisma/client";

/**
 * Lazy Prisma singleton. Returns null when DATABASE_URL is not set, so
 * importing this module never crashes a build / dev server that runs
 * without the database (the local backend remains usable).
 *
 * In dev, the client is cached on globalThis to survive Next.js HMR
 * reloads (per the Prisma + Next.js best practice).
 */
const globalForPrisma = globalThis as unknown as {
  __brainArenaPrisma?: PrismaClient | null;
  __brainArenaPrismaAttempted?: boolean;
};

export function getPrisma(): PrismaClient | null {
  if (globalForPrisma.__brainArenaPrismaAttempted) {
    return globalForPrisma.__brainArenaPrisma ?? null;
  }
  globalForPrisma.__brainArenaPrismaAttempted = true;
  if (!process.env.DATABASE_URL) {
    globalForPrisma.__brainArenaPrisma = null;
    return null;
  }
  try {
    const client = new PrismaClient({
      log:
        process.env.NODE_ENV === "production"
          ? ["error"]
          : ["warn", "error"],
    });
    globalForPrisma.__brainArenaPrisma = client;
    return client;
  } catch {
    globalForPrisma.__brainArenaPrisma = null;
    return null;
  }
}

export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export class DbNotConfiguredError extends Error {
  constructor() {
    super(
      "DATABASE_URL is not configured. Set it in .env.local and run `npm run db:migrate:dev`.",
    );
    this.name = "DbNotConfiguredError";
  }
}

/** Returns the Prisma client or throws DbNotConfiguredError. */
export function requirePrisma(): PrismaClient {
  const client = getPrisma();
  if (!client) throw new DbNotConfiguredError();
  return client;
}
