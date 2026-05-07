import { NextResponse } from "next/server";
import { deleteCurrentSession } from "../../../lib/auth/server";

export const runtime = "nodejs";

export async function POST() {
  await deleteCurrentSession();
  return NextResponse.json({ ok: true });
}
