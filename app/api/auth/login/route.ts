import { NextResponse } from "next/server";
import { isDbConfigured, DbNotConfiguredError } from "../../../lib/prisma";
import {
  verifyPassword,
  createSession,
  setSessionCookie,
} from "../../../lib/auth/server";
import { usersService } from "../../../lib/services/users";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { ok: false, reason: "Backend not configured." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, reason: "Invalid JSON." },
      { status: 400 },
    );
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, reason: "Invalid input." },
      { status: 400 },
    );
  }

  try {
    const user = await usersService.findByEmail(parsed.data.email.toLowerCase().trim());
    // Constant-message rejection to avoid email-enumeration.
    if (!user) {
      return NextResponse.json(
        { ok: false, reason: "Invalid email or password." },
        { status: 401 },
      );
    }
    const ok = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!ok) {
      return NextResponse.json(
        { ok: false, reason: "Invalid email or password." },
        { status: 401 },
      );
    }

    const token = await createSession(user.id);
    await setSessionCookie(token);

    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.profile?.username ?? user.email.split("@")[0],
      },
    });
  } catch (err) {
    if (err instanceof DbNotConfiguredError) {
      return NextResponse.json(
        { ok: false, reason: "Backend not configured." },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { ok: false, reason: "Server error." },
      { status: 500 },
    );
  }
}
