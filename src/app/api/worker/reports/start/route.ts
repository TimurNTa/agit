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
  if (!assignmentId || !Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const assignment = await prisma.assignment.findFirst({ where: { id: assignmentId, agitatorId: worker.id }, include: { house: true } });
  if (!assignment) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (assignment.status === "ACCEPTED") return NextResponse.json({ error: "already_accepted" }, { status: 409 });
  if (assignment.status === "SUBMITTED") return NextResponse.json({ error: "already_submitted" }, { status: 409 });
  const distance = distanceMeters(lat, lon, assignment.house.lat, assignment.house.lon);
  if (distance > config.maxReportDistanceMeters) return NextResponse.json({ error: "too_far", distance, limit: config.maxReportDistanceMeters }, { status: 422 });
  const recentCutoff = new Date(Date.now() - 20 * 60_000);
  let report = await prisma.report.findFirst({ where: { assignmentId: assignment.id, agitatorId: worker.id, status: "DRAFT", createdAt: { gte: recentCutoff } }, orderBy: { createdAt: "desc" } });
  if (report) {
    report = await prisma.report.update({ where: { id: report.id }, data: { lat, lon, accuracyMeters: Number.isFinite(accuracy) ? accuracy : null, distanceMeters: distance } });
    if (assignment.status !== "ACTIVE") await prisma.assignment.update({ where: { id: assignment.id }, data: { status: "ACTIVE" } });
  } else {
    report = await prisma.$transaction(async (tx) => {
      const created = await tx.report.create({ data: { assignmentId: assignment.id, agitatorId: worker.id, lat, lon, accuracyMeters: Number.isFinite(accuracy) ? accuracy : null, distanceMeters: distance, status: "DRAFT" } });
      await tx.assignment.update({ where: { id: assignment.id }, data: { status: "ACTIVE" } });
      await tx.activityLog.create({ data: { actorType: "AGITATOR", actorId: worker.id, actorName: worker.name, action: "REPORT_STARTED", entityType: "Report", entityId: created.id, agitatorId: worker.id, message: `${worker.name}: начал отчёт по ${assignment.house.address}` } });
      return created;
    });
  }
  return NextResponse.json({ ok: true, reportId: report.id, distance, vkMessagesUrl: config.vkMessagesUrl });
}
