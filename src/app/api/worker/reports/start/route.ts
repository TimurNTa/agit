import { NextResponse } from "next/server";
import { getWorker } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { distanceMeters } from "@/lib/geo";
import { config } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const worker = await getWorker();
  if (!worker) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const assignmentId = String(body?.assignmentId || "");
  const lat = Number(body?.lat);
  const lon = Number(body?.lon);
  const accuracy = body?.accuracy == null ? null : Number(body.accuracy);
  if (!assignmentId || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const assignment = await prisma.assignment.findFirst({
    where: { id: assignmentId, agitatorId: worker.id },
    include: { house: true },
  });
  if (!assignment) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (assignment.status === "ACCEPTED") return NextResponse.json({ error: "already_accepted" }, { status: 409 });

  const distance = distanceMeters(lat, lon, assignment.house.lat, assignment.house.lon);
  if (distance > config.maxReportDistanceMeters) {
    return NextResponse.json({ error: "too_far", distance, limit: config.maxReportDistanceMeters }, { status: 422 });
  }

  const report = await prisma.report.create({
    data: {
      assignmentId: assignment.id,
      agitatorId: worker.id,
      lat,
      lon,
      accuracyMeters: Number.isFinite(accuracy) ? accuracy : null,
      distanceMeters: distance,
      status: "DRAFT",
    },
  });
  await prisma.assignment.update({ where: { id: assignment.id }, data: { status: "ACTIVE" } });
  return NextResponse.json({ ok: true, reportId: report.id, distance, vkMessagesUrl: config.vkMessagesUrl });
}
