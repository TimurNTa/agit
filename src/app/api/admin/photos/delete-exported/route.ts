import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/security";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST() {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const photos = await prisma.reportPhoto.findMany({
    where: { deletedAt: null, report: { exportedAt: { not: null } } },
    select: { id: true, filePath: true },
  });
  let deleted = 0;
  for (const photo of photos) {
    try { await fs.rm(photo.filePath, { force: true }); } catch { continue; }
    await prisma.reportPhoto.update({ where: { id: photo.id }, data: { deletedAt: new Date() } });
    deleted += 1;
  }
  await prisma.activityLog.create({ data: { actorType: "ADMIN", actorName: "Штаб", action: "EXPORTED_PHOTOS_DELETED", entityType: "ReportPhoto", message: `Удалено выгруженных фотографий: ${deleted}`, metadata: { count: deleted } } });
  return NextResponse.json({ ok: true, deleted });
}
