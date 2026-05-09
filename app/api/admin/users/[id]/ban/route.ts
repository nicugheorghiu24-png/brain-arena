import { NextResponse } from "next/server";
import { requirePrisma, isDbConfigured } from "../../../../../lib/prisma";
import { requireAdmin, AdminUnauthorized } from "../../../../../lib/auth/admin";
import { z } from "zod";

export const runtime = "nodejs";

const banSchema = z.object({
  reason: z.string().min(3).max(500),
  // Optional admin name / handle to record in `bannedBy`.
  by: z.string().min(1).max(64).optional(),
});

export async function POST(
  req: Request,
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "Invalid JSON." }, { status: 400 });
  }
  const parsed = banSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, reason: "Invalid input." }, { status: 400 });
  }

  const prisma = requirePrisma();
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    return NextResponse.json({ ok: false, reason: "Not found." }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: {
        bannedAt: new Date(),
        banReason: parsed.data.reason,
        bannedBy: parsed.data.by ?? "admin",
      },
    }),
    // Drop all of the user's sessions so they're booted from any
    // active client immediately, not just at next page load.
    prisma.session.deleteMany({ where: { userId: id } }),
    prisma.auditEvent.create({
      data: {
        userId: id,
        category: "ban",
        severity: "alert",
        flags: ["banned"],
        details: { reason: parsed.data.reason, by: parsed.data.by ?? "admin" },
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    bannedAt: new Date().toISOString(),
    reason: parsed.data.reason,
  });
}
