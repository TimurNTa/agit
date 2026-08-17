import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/security";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const photo = await prisma.reportPhoto.findUnique({ where: { id } });
  if (!photo || photo.deletedAt) return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    const buffer = await fs.readFile(photo.filePath);
    return new NextResponse(buffer, {
      headers: {
        "content-type": photo.mimeType,
        "cache-control": "private, max-age=300",
        "content-disposition": `inline; filename="${photo.id}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "file_missing" }, { status: 410 });
  }
}
