import { requirePrisma } from "../prisma";

export const usersService = {
  async create(opts: {
    email: string;
    passwordHash: string;
    username: string;
  }) {
    const prisma = requirePrisma();
    return prisma.user.create({
      data: {
        email: opts.email,
        passwordHash: opts.passwordHash,
        profile: { create: { username: opts.username } },
      },
      include: { profile: true },
    });
  },

  async findByEmail(email: string) {
    const prisma = requirePrisma();
    return prisma.user.findUnique({
      where: { email },
      include: { profile: true },
    });
  },

  async findById(id: string) {
    const prisma = requirePrisma();
    return prisma.user.findUnique({
      where: { id },
      include: { profile: true },
    });
  },

  async findByUsername(username: string) {
    const prisma = requirePrisma();
    const profile = await prisma.profile.findUnique({
      where: { username },
      include: { user: true },
    });
    return profile?.user ?? null;
  },

  async existsByEmailOrUsername(email: string, username: string) {
    const prisma = requirePrisma();
    const [byEmail, byUsername] = await Promise.all([
      prisma.user.findUnique({ where: { email } }),
      prisma.profile.findUnique({ where: { username } }),
    ]);
    return Boolean(byEmail || byUsername);
  },

  async deleteById(id: string) {
    const prisma = requirePrisma();
    await prisma.user.delete({ where: { id } });
  },
};
