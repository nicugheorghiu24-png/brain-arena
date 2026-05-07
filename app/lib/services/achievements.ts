import { requirePrisma } from "../prisma";

export const achievementsService = {
  async listForUser(userId: string) {
    const prisma = requirePrisma();
    return prisma.userAchievement.findMany({
      where: { userId },
      include: { achievement: true },
      orderBy: { unlockedAt: "desc" },
    });
  },

  async unlock(userId: string, achievementId: string) {
    const prisma = requirePrisma();
    return prisma.userAchievement.upsert({
      where: { userId_achievementId: { userId, achievementId } },
      create: { userId, achievementId },
      update: {},
    });
  },

  async unlockIfExists(userId: string, achievementId: string) {
    const prisma = requirePrisma();
    const achievement = await prisma.achievement.findUnique({
      where: { id: achievementId },
    });
    if (!achievement) {
      return null;
    }
    return this.unlock(userId, achievementId);
  },

  async listCatalog() {
    const prisma = requirePrisma();
    return prisma.achievement.findMany();
  },
};
