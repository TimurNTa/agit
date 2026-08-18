import { NextResponse } from "next/server";
import { createAdminSession, verifyAdminPassword } from "@/lib/security";

type Attempt = { count: number; resetAt: number };
const globalRate = globalThis as unknown as { agitAdminAttempts?: Map<string, Attempt> };
const attempts = globalRate.agitAdminAttempts ?? new Map<string, Attempt>();
globalRate.agitAdminAttempts = attempts;

export async function POST(request: Request) {
  const key = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const current = attempts.get(key);
  if (current && current.resetAt > now && current.count >= 8) return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  const body = await request.json().catch(() => null);
  const password = String(body?.password || "");
  if (!password || !verifyAdminPassword(password)) {
    attempts.set(key, current && current.resetAt > now ? { ...current, count: current.count + 1 } : { count: 1, resetAt: now + 15 * 60_000 });
    return NextResponse.json({ error: "invalid_password" }, { status: 401 });
  }
  attempts.delete(key);
  await createAdminSession();
  return NextResponse.json({ ok: true });
}
