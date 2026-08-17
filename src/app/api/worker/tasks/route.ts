import { NextResponse } from "next/server";
import { getWorker } from "@/lib/security";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const worker = await getWorker();
  if (!worker) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const assignments = await prisma.assignment.findMany({
    where: { agitatorId: worker.id },
    include: { house: true },
    orderBy: [{ status: "asc" }, { house: { address: "asc" } }],
  });
  return NextResponse.json({
    worker: { id: worker.id, name: worker.name, vkId: worker.vkId.toString() },
    tasks: assignments.map((item) => ({
      id: item.id,
      status: item.status,
      address: item.house.address,
      lat: item.house.lat,
      lon: item.house.lon,
      note: item.house.note,
    })),
  });
}
