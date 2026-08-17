import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, service: "agit", time: new Date().toISOString() });
  } catch {
    return NextResponse.json({ ok: false, service: "agit" }, { status: 503 });
  }
}
