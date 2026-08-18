import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { vkSend } from "@/lib/vk";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const action = String(body?.action || "");
  const comment = String(body?.comment || "").replace(/\s+/g, " ").trim().slice(0, 500);
  if (action !== "accept" && action !== "reject") return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  if (action === "reject" && !comment) return NextResponse.json({ error: "comment_required" }, { status: 400 });
  const report = await prisma.report.findUnique({ where: { id }, include: { agitator: true, assignment: { include: { house: true } } } });
  if (!report) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (report.status !== "SUBMITTED") return NextResponse.json({ error: "already_reviewed" }, { status: 409 });
  const status = action === "accept" ? "ACCEPTED" : "REJECTED";
  await prisma.$transaction([
    prisma.report.update({ where: { id }, data: { status, reviewedAt: new Date(), reviewComment: comment || null } }),
    prisma.assignment.update({ where: { id: report.assignmentId }, data: { status } }),
    prisma.activityLog.create({ data: { actorType: "ADMIN", actorName: "Штаб", action: action === "accept" ? "REPORT_ACCEPTED" : "REPORT_REJECTED", entityType: "Report", entityId: id, agitatorId: report.agitatorId, message: `${report.agitator.name}: отчёт по ${report.assignment.house.address} ${action === "accept" ? "принят" : `отправлен на переделку — ${comment}`}` } }),
  ]);
  const message = action === "accept"
    ? `✅ Отчёт по адресу «${report.assignment.house.address}» принят штабом.`
    : `🔁 Отчёт по адресу «${report.assignment.house.address}» нужно переделать. Причина: ${comment}`;
  const notificationSent = await vkSend(Number(report.agitator.vkId), message).then(() => true).catch((error) => { console.error("VK review notification failed", error); return false; });
  return NextResponse.json({ ok: true, notificationSent });
}
