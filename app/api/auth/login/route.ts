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

  // Static dummy hash used for timing equalization. bcrypt verification
  // takes ~150-300ms regardless of input; running it on the no-user path
  // closes the timing side-channel that would otherwise let an attacker
  // distinguish "email doesn't exist" from "wrong password" by latency.
  // The hash itself is never compared to a real password — we just want
  // bcrypt to do the work.
  const DUMMY_HASH =
    "$2a$12$abcdefghijklmnopqrstuuU3K8hGd/Vx3rRP2H7WQRpgSk0oGzWAS";
  try {
    const user = await usersService.findByEmail(parsed.data.email.toLowerCase().trim());
    const passwordToVerify = user?.passwordHash ?? DUMMY_HASH;
    const ok = await verifyPassword(parsed.data.password, passwordToVerify);
    if (!user || !ok) {
      return NextResponse.json(
        { ok: false, reason: "Invalid email or password." },
        { status: 401 },
      );
    }
    // Banned account — refuse to issue a new session. The server-side
    // getCurrentUser() also rejects bannedAt-set users, but we want
    // the login response itself to be honest about why it's failing.
    if (user.bannedAt) {
      return NextResponse.json(
        {
          ok: false,
          reason: "Account suspended. Contact support if you believe this is an error.",
        },
        { status: 403 },
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
