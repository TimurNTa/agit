import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/security";
import { prisma } from "@/lib/prisma";

export async function POST() {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await prisma.report.updateMany({
    where: { status: { in: ["SUBMITTED", "ACCEPTED"] }, exportedAt: null, photos: { some: { deletedAt: null } } },
    data: { exportedAt: new Date() },
  });
  await prisma.activityLog.create({ data: { actorType: "ADMIN", actorName: "Штаб", action: "EXPORT_CONFIRMED", entityType: "Report", message: `Подтверждена выгрузка отчётов: ${result.count}`, metadata: { count: result.count } } });
  return NextResponse.json({ ok: true, marked: result.count });
}
