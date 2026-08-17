import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/security";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const name = String(body?.name || "").trim();
  const vkId = String(body?.vkId || "").trim();
  if (!name || !/^\d{1,20}$/.test(vkId)) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const agitator = await prisma.agitator.create({ data: { name, vkId: BigInt(vkId) } });
  return NextResponse.json({ ok: true, id: agitator.id });
}
