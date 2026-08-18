import { NextResponse } from "next/server";
import { getWorker } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { buildRouteOrder } from "@/lib/route-order";

export async function POST(request: Request) {
  const worker = await getWorker();
  if (!worker) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const lat = Number(body?.lat);
  const lon = Number(body?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const assignments = await prisma.assignment.findMany({ where: { agitatorId: worker.id, status: { in: ["TODO", "ACTIVE", "REJECTED"] } }, include: { house: true } });
  const order = buildRouteOrder(assignments.map((assignment) => ({ id: assignment.id, lat: assignment.house.lat, lon: assignment.house.lon })), { lat, lon });
  if (order.length) await prisma.$transaction(order.map((id, index) => prisma.assignment.update({ where: { id }, data: { routeOrder: index + 1 } })));
  return NextResponse.json({ ok: true, changed: order.length });
}
