import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/security";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const action = String(body?.action || "");
  if (action !== "accept" && action !== "reject") return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  const report = await prisma.report.findUnique({ where: { id } });
  if (!report) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const reportStatus = action === "accept" ? "ACCEPTED" : "REJECTED";
  const assignmentStatus = action === "accept" ? "ACCEPTED" : "REJECTED";
  await prisma.$transaction([
    prisma.report.update({ where: { id }, data: { status: reportStatus } }),
    prisma.assignment.update({ where: { id: report.assignmentId }, data: { status: assignmentStatus } }),
  ]);
  return NextResponse.json({ ok: true });
}
