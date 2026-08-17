import fs from "node:fs";
import path from "node:path";
import { PassThrough, Readable } from "node:stream";
import archiver from "archiver";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/security";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 100) || "Без названия";
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const reports = await prisma.report.findMany({
    where: { status: { in: ["SUBMITTED", "ACCEPTED"] }, photos: { some: { deletedAt: null } } },
    include: { agitator: true, assignment: { include: { house: true } }, photos: { where: { deletedAt: null } } },
    orderBy: { createdAt: "asc" },
  });

  const pass = new PassThrough();
  const archive = archiver("zip", { zlib: { level: 6 } });
  archive.on("error", (error) => pass.destroy(error));
  archive.pipe(pass);

  for (const report of reports) {
    const date = report.createdAt.toISOString().slice(0, 10);
    const folder = `${date}/${clean(report.agitator.name)}/${clean(report.assignment.house.address)}`;
    report.photos.forEach((photo, index) => {
      if (fs.existsSync(photo.filePath)) archive.file(photo.filePath, { name: `${folder}/${String(index + 1).padStart(2, "0")}${path.extname(photo.filePath) || ".jpg"}` });
    });
  }
  void archive.finalize();

  return new NextResponse(Readable.toWeb(pass) as ReadableStream, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="agit-reports-${new Date().toISOString().slice(0, 10)}.zip"`,
      "cache-control": "no-store",
    },
  });
}
