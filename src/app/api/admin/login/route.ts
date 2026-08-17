import { NextResponse } from "next/server";
import { createAdminSession, verifyAdminPassword } from "@/lib/security";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const password = String(body?.password || "");
  if (!password || !verifyAdminPassword(password)) return NextResponse.json({ error: "invalid_password" }, { status: 401 });
  await createAdminSession();
  return NextResponse.json({ ok: true });
}
