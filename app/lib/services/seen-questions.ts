import { requirePrisma } from "../prisma";

const DEFAULT_DAYS = 60;
const PRUNE_DAYS = 90;

export const seenQuestionsService = {
  /**
   * Returns hashes the user has seen within the given window (default
   * 60 days). The match assembler uses this set to filter the
   * deterministic question stream.
   */
  async getRecentHashes(
    userId: string,
    days: number = DEFAULT_DAYS,
  ): Promise<Set<string>> {
    const prisma = requirePrisma();
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await prisma.seenQuestion.findMany({
      where: { userId, seenAt: { gte: cutoff } },
      select: { questionHash: true },
    });
    return new Set(rows.map((r) => r.questionHash));
  },

  async markBatch(userId: string, hashes: string[]) {
    if (hashes.length === 0) return;
    const prisma = requirePrisma();
    await prisma.seenQuestion.createMany({
      data: hashes.map((h) => ({ userId, questionHash: h })),
      skipDuplicates: true,
    });
  },

  async prune(olderThanDays: number = PRUNE_DAYS) {
    const prisma = requirePrisma();
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    return prisma.seenQuestion.deleteMany({
      where: { seenAt: { lt: cutoff } },
    });
  },
};
