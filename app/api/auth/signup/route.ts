import { NextResponse } from "next/server";
import { isDbConfigured, DbNotConfiguredError } from "../../../lib/prisma";
import {
  hashPassword,
  createSession,
  setSessionCookie,
} from "../../../lib/auth/server";
import { usersService } from "../../../lib/services/users";
import { z } from "zod";

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  username: z.string().min(3).max(20).regex(/^[A-Za-z0-9_-]+$/),
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

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, reason: "Invalid input." },
      { status: 400 },
    );
  }

  try {
    const exists = await usersService.existsByEmailOrUsername(
      parsed.data.email.toLowerCase().trim(),
      parsed.data.username.trim(),
    );
    if (exists) {
      return NextResponse.json(
        { ok: false, reason: "Email or username already taken." },
        { status: 409 },
      );
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const user = await usersService.create({
      email: parsed.data.email.toLowerCase().trim(),
      passwordHash,
      username: parsed.data.username.trim(),
    });

    const token = await createSession(user.id);
    await setSessionCookie(token);

    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        username: parsed.data.username,
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
