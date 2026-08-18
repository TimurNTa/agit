import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { vkSend } from "@/lib/vk";

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const name = String(body?.name || "").replace(/\s+/g, " ").trim().slice(0, 120);
  const vkId = String(body?.vkId || "").trim();
  if (!name || !/^\d{1,15}$/.test(vkId)) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const recipient = await prisma.notificationRecipient.upsert({ where: { vkId: BigInt(vkId) }, create: { name, vkId: BigInt(vkId) }, update: { name, active: true } });
  const testSent = await vkSend(Number(recipient.vkId), "🔔 Уведомления штаба AGIT включены. Сюда будут приходить новые фотоотчёты.").then(() => true).catch(() => false);
  await prisma.activityLog.create({ data: { actorType: "ADMIN", actorName: "Штаб", action: "NOTIFICATIONS_ENABLED", entityType: "NotificationRecipient", entityId: recipient.id, message: `VK-уведомления включены для ${name}` } });
  return NextResponse.json({ ok: true, id: recipient.id, testSent });
}

export async function DELETE(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const id = String(body?.id || "");
  if (!id) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  await prisma.notificationRecipient.update({ where: { id }, data: { active: false } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
