import { NextResponse } from "next/server";
import { requirePrisma, isDbConfigured } from "../../../../../lib/prisma";
import { requireAdmin, AdminUnauthorized } from "../../../../../lib/auth/admin";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AdminUnauthorized) {
      return NextResponse.json({ ok: false, reason: err.message }, { status: 401 });
    }
    throw err;
  }
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, reason: "Backend not configured." }, { status: 503 });
  }
  const { id } = await context.params;

  const prisma = requirePrisma();
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    return NextResponse.json({ ok: false, reason: "Not found." }, { status: 404 });
  }
  if (!user.bannedAt) {
    return NextResponse.json({ ok: true, alreadyUnbanned: true });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: { bannedAt: null, banReason: null, bannedBy: null },
    }),
    prisma.auditEvent.create({
      data: {
        userId: id,
        category: "ban",
        severity: "info",
        flags: ["unbanned"],
        details: { previousReason: user.banReason },
      },
    }),
  ]);

  return NextResponse.json({ ok: true, unbannedAt: new Date().toISOString() });
}
