import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const rawHouseIds: string[] = Array.isArray(body?.houseIds)
    ? body.houseIds.map((value: unknown) => String(value).trim()).filter(Boolean)
    : [String(body?.houseId || "").trim()].filter(Boolean);
  const houseIds = [...new Set(rawHouseIds)];
  const agitatorId = String(body?.agitatorId || "").trim();
  if (!houseIds.length || houseIds.length > 1000) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const houses = await prisma.house.findMany({ where: { id: { in: houseIds } }, select: { id: true } });
  if (houses.length !== houseIds.length) return NextResponse.json({ error: "house_not_found" }, { status: 404 });
  if (!agitatorId) {
    const removed = await prisma.assignment.deleteMany({ where: { houseId: { in: houseIds }, campaign: "2026", status: "TODO", reports: { none: {} } } });
    await logActivity({ actorType: "ADMIN", actorName: "Штаб", action: "ASSIGNMENTS_REMOVED", entityType: "Assignment", message: `Снято назначений: ${removed.count}`, metadata: { count: removed.count } });
    return NextResponse.json({ ok: true, changed: removed.count, locked: houseIds.length - removed.count });
  }
  const agitator = await prisma.agitator.findFirst({ where: { id: agitatorId, active: true } });
  if (!agitator) return NextResponse.json({ error: "agitator_not_found" }, { status: 404 });
  const existing = await prisma.assignment.findMany({ where: { houseId: { in: houseIds }, campaign: "2026" } });
  const lockedIds = new Set(existing.filter((item) => ["ACTIVE", "SUBMITTED", "ACCEPTED"].includes(item.status)).map((item) => item.houseId));
  const editableIds = houseIds.filter((id) => !lockedIds.has(id));
  const maxOrder = await prisma.assignment.aggregate({ where: { agitatorId }, _max: { routeOrder: true } });
  const startOrder = (maxOrder._max.routeOrder || 0) + 1;
  if (editableIds.length) {
    await prisma.$transaction(editableIds.map((houseId, index) => prisma.assignment.upsert({
      where: { houseId_campaign: { houseId, campaign: "2026" } },
      create: { houseId, agitatorId, campaign: "2026", status: "TODO", routeOrder: startOrder + index },
      update: { agitatorId, status: "TODO", routeOrder: startOrder + index },
    })));
  }
  await logActivity({ actorType: "ADMIN", actorName: "Штаб", action: "ASSIGNMENTS_UPDATED", entityType: "Assignment", agitatorId, message: `${agitator.name}: назначено домов — ${editableIds.length}${lockedIds.size ? `, пропущено защищённых — ${lockedIds.size}` : ""}`, metadata: { changed: editableIds.length, locked: lockedIds.size } });
  return NextResponse.json({ ok: true, changed: editableIds.length, locked: lockedIds.size });
}
