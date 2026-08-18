import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const name = String(body?.name || "").replace(/\s+/g, " ").trim().slice(0, 120);
  const vkId = String(body?.vkId || "").trim();
  if (!name || !/^\d{1,15}$/.test(vkId)) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  try {
    const agitator = await prisma.agitator.create({ data: { name, vkId: BigInt(vkId) } });
    await logActivity({ actorType: "ADMIN", actorName: "Штаб", action: "AGITATOR_ADDED", entityType: "Agitator", entityId: agitator.id, agitatorId: agitator.id, message: `Добавлен агитатор ${name}` });
    return NextResponse.json({ ok: true, id: agitator.id });
  } catch {
    return NextResponse.json({ error: "vk_id_exists" }, { status: 409 });
  }
}

export async function PATCH(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const id = String(body?.id || "");
  const active = body?.active;
  if (!id || typeof active !== "boolean") return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const agitator = await prisma.agitator.update({ where: { id }, data: { active } }).catch(() => null);
  if (!agitator) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await logActivity({ actorType: "ADMIN", actorName: "Штаб", action: active ? "AGITATOR_ENABLED" : "AGITATOR_PAUSED", entityType: "Agitator", entityId: id, agitatorId: id, message: `${agitator.name}: ${active ? "доступ включён" : "доступ приостановлен"}` });
  return NextResponse.json({ ok: true });
}
