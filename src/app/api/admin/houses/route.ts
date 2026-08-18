import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { canDeleteHousePoint } from "@/lib/house-safety";

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const address = String(body?.address || "").replace(/\s+/g, " ").trim().slice(0, 240);
  const note = String(body?.note || "").trim().slice(0, 500) || null;
  const lat = Number(body?.lat);
  const lon = Number(body?.lon);
  const agitatorId = String(body?.agitatorId || "").trim();
  if (!address || !Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const duplicate = await prisma.house.findFirst({ where: { address: { equals: address, mode: "insensitive" } }, select: { id: true } });
  if (duplicate) return NextResponse.json({ error: "house_exists", houseId: duplicate.id }, { status: 409 });
  if (agitatorId && !(await prisma.agitator.findFirst({ where: { id: agitatorId, active: true }, select: { id: true } }))) return NextResponse.json({ error: "agitator_not_found" }, { status: 404 });
  const result = await prisma.$transaction(async (tx) => {
    const house = await tx.house.create({ data: { address, lat, lon, note, source: "manual" } });
    let assignment = null;
    if (agitatorId) {
      const maxOrder = await tx.assignment.aggregate({ where: { agitatorId }, _max: { routeOrder: true } });
      assignment = await tx.assignment.create({ data: { houseId: house.id, agitatorId, routeOrder: (maxOrder._max.routeOrder || 0) + 1 } });
    }
    await tx.activityLog.create({ data: { actorType: "ADMIN", actorName: "Штаб", action: "HOUSE_ADDED", entityType: "House", entityId: house.id, agitatorId: agitatorId || null, message: `Добавлен дом: ${address}` } });
    return { house, assignment };
  });
  return NextResponse.json({ ok: true, houseId: result.house.id, assignmentId: result.assignment?.id || null });
}

export async function DELETE(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const houseIds = Array.isArray(body?.houseIds)
    ? [...new Set<string>(body.houseIds.map((value: unknown) => String(value).trim()).filter(Boolean))]
    : [String(body?.houseId || "").trim()].filter(Boolean);
  if (!houseIds.length || houseIds.length > 1000) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const houses = await prisma.house.findMany({
    where: { id: { in: houseIds } },
    include: { assignments: { include: { _count: { select: { reports: true } } } } },
  });
  const removable = houses.filter((house) => canDeleteHousePoint(house.assignments.map((assignment) => ({ status: assignment.status, reportCount: assignment._count.reports }))));
  const removableIds = removable.map((house) => house.id);
  const deleted = removableIds.length ? await prisma.house.deleteMany({ where: { id: { in: removableIds }, assignments: { every: { status: "TODO", reports: { none: {} } } } } }) : { count: 0 };
  const locked = houses.length - deleted.count;
  const missing = houseIds.length - houses.length;
  await logActivity({
    actorType: "ADMIN",
    actorName: "Штаб",
    action: "HOUSES_DELETED",
    entityType: "House",
    message: `Удалено точек домов: ${deleted.count}${locked ? `, защищено историей — ${locked}` : ""}`,
    metadata: { count: deleted.count, locked, missing },
  });
  return NextResponse.json({ ok: true, deleted: deleted.count, deletedIds: removableIds, locked, missing });
}
