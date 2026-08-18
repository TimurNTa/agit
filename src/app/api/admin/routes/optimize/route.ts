import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { buildManagedRouteOrder, type ManagedRouteStrategy } from "@/lib/route-order";

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const agitatorId = String(body?.agitatorId || "");
  const strategy: ManagedRouteStrategy = ["nearest", "address", "reverse"].includes(String(body?.strategy)) ? body.strategy : "nearest";
  const startLat = body?.startLat == null ? null : Number(body.startLat);
  const startLon = body?.startLon == null ? null : Number(body.startLon);
  if (!agitatorId || (startLat == null) !== (startLon == null) || (startLat != null && (!Number.isFinite(startLat) || startLat < -90 || startLat > 90)) || (startLon != null && (!Number.isFinite(startLon) || startLon < -180 || startLon > 180))) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const agitator = await prisma.agitator.findUnique({ where: { id: agitatorId }, select: { name: true } });
  if (!agitator) return NextResponse.json({ error: "agitator_not_found" }, { status: 404 });
  const assignments = await prisma.assignment.findMany({ where: { agitatorId, status: { in: ["TODO", "ACTIVE", "REJECTED"] } }, include: { house: true } });
  if (!assignments.length) return NextResponse.json({ ok: true, changed: 0 });
  const order = buildManagedRouteOrder(assignments.map((assignment) => ({ id: assignment.id, lat: assignment.house.lat, lon: assignment.house.lon, address: assignment.house.address, routeOrder: assignment.routeOrder })), strategy, startLat != null && startLon != null ? { lat: startLat, lon: startLon } : undefined);
  await prisma.$transaction(order.map((id, index) => prisma.assignment.update({ where: { id }, data: { routeOrder: index + 1 } })));
  const strategyLabel = strategy === "reverse" ? "развёрнут" : strategy === "address" ? "отсортирован по адресам" : startLat != null ? "построен от выбранной точки" : "оптимизирован";
  await prisma.activityLog.create({ data: { actorType: "ADMIN", actorName: "Штаб", agitatorId, action: "ROUTE_OPTIMIZED", entityType: "Assignment", message: `${agitator.name}: маршрут ${strategyLabel}, домов — ${order.length}`, metadata: { count: order.length, strategy } } });
  return NextResponse.json({ ok: true, changed: order.length, order, strategy });
}
