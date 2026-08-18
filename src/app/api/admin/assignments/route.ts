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
  const existing = await prisma.assignment.findMany({
    where: { houseId: { in: houseIds }, campaign: "2026" },
    include: { _count: { select: { reports: true } } },
  });
  const lockedIds = new Set(existing.filter((item) => item.status !== "TODO" || item._count.reports > 0).map((item) => item.houseId));
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

export async function DELETE(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const clearAll = body?.all === true;
  const agitatorId = clearAll ? "" : String(body?.agitatorId || "").trim();
  const houseIds = !clearAll && Array.isArray(body?.houseIds)
    ? [...new Set<string>(body.houseIds.map((value: unknown) => String(value).trim()).filter(Boolean))]
    : [];
  if ((!agitatorId && !houseIds.length && !clearAll) || houseIds.length > 1000) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const assignments = await prisma.assignment.findMany({
    where: {
      campaign: "2026",
      ...(agitatorId ? { agitatorId } : {}),
      ...(houseIds.length ? { houseId: { in: houseIds } } : {}),
    },
    include: { _count: { select: { reports: true } } },
  });
  const removableIds = assignments
    .filter((assignment) => assignment.status === "TODO" && assignment._count.reports === 0)
    .map((assignment) => assignment.id);
  const removed = removableIds.length
    ? await prisma.assignment.deleteMany({ where: { id: { in: removableIds } } })
    : { count: 0 };
  const agitator = agitatorId
    ? await prisma.agitator.findUnique({ where: { id: agitatorId }, select: { name: true } })
    : null;
  const locked = assignments.length - removed.count;
  await logActivity({
    actorType: "ADMIN",
    actorName: "Штаб",
    action: clearAll ? "ALL_ROUTES_CLEARED" : agitatorId ? "ROUTE_CLEARED" : "ASSIGNMENTS_REMOVED",
    entityType: "Assignment",
    agitatorId: agitatorId || null,
    message: clearAll
      ? `Очищены все свободные маршруты: снято — ${removed.count}${locked ? `, защищено историей — ${locked}` : ""}`
      : agitatorId
      ? `${agitator?.name || "Агитатор"}: снято из маршрута — ${removed.count}${locked ? `, защищено историей — ${locked}` : ""}`
      : `Снято выбранных назначений: ${removed.count}${locked ? `, защищено историей — ${locked}` : ""}`,
    metadata: { count: removed.count, locked },
  });
  return NextResponse.json({ ok: true, changed: removed.count, locked, total: assignments.length });
}
