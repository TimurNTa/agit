import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/security";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [agitators, houses, assignments, reports] = await Promise.all([
    prisma.agitator.findMany({ orderBy: { name: "asc" } }),
    prisma.house.findMany({ orderBy: { address: "asc" } }),
    prisma.assignment.findMany({ include: { agitator: true, house: true }, orderBy: { createdAt: "desc" } }),
    prisma.report.findMany({
      include: { agitator: true, assignment: { include: { house: true } }, photos: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);
  return NextResponse.json({
    agitators: agitators.map((a) => ({ id: a.id, name: a.name, vkId: a.vkId.toString(), active: a.active })),
    houses,
    assignments: assignments.map((a) => ({ id: a.id, status: a.status, agitatorId: a.agitatorId, agitatorName: a.agitator.name, houseId: a.houseId, address: a.house.address })),
    reports: reports.map((r) => ({
      id: r.id,
      status: r.status,
      agitatorName: r.agitator.name,
      address: r.assignment.house.address,
      distanceMeters: r.distanceMeters,
      createdAt: r.createdAt,
      exportedAt: r.exportedAt,
      photos: r.photos.map((p) => ({ id: p.id, sizeBytes: p.sizeBytes })),
    })),
  });
}
