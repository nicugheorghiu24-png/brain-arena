import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth/server";
import { isDbConfigured } from "../../../lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ user: null }, { status: 200 });
  }
  const user = await getCurrentUser();
  return NextResponse.json({ user });
}
