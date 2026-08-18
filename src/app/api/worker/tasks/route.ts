import { NextResponse } from "next/server";
import { getWorker } from "@/lib/security";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const worker = await getWorker();
  if (!worker) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const assignments = await prisma.assignment.findMany({
    where: { agitatorId: worker.id },
    include: { house: true, reports: { where: { status: "REJECTED" }, orderBy: { reviewedAt: "desc" }, take: 1, select: { reviewComment: true } } },
  });
  assignments.sort((a, b) => {
    if ((a.status === "ACCEPTED") !== (b.status === "ACCEPTED")) return a.status === "ACCEPTED" ? 1 : -1;
    return (a.routeOrder ?? Number.MAX_SAFE_INTEGER) - (b.routeOrder ?? Number.MAX_SAFE_INTEGER) || a.house.address.localeCompare(b.house.address, "ru");
  });
  return NextResponse.json({
    worker: { id: worker.id, name: worker.name, vkId: worker.vkId.toString() },
    tasks: assignments.map((item) => ({ id: item.id, status: item.status, routeOrder: item.routeOrder, address: item.house.address, lat: item.house.lat, lon: item.house.lon, note: item.house.note, rejectionReason: item.status === "REJECTED" ? item.reports[0]?.reviewComment || null : null })),
  });
}
