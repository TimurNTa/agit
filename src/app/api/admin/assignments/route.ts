import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/security";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const houseId = String(body?.houseId || "").trim();
  const agitatorId = String(body?.agitatorId || "").trim();
  if (!houseId) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const house = await prisma.house.findUnique({ where: { id: houseId } });
  if (!house) return NextResponse.json({ error: "house_not_found" }, { status: 404 });

  if (!agitatorId) {
    await prisma.assignment.deleteMany({ where: { houseId, campaign: "2026", status: { in: ["TODO", "ACTIVE", "REJECTED"] } } });
    return NextResponse.json({ ok: true, assignmentId: null });
  }

  const agitator = await prisma.agitator.findFirst({ where: { id: agitatorId, active: true } });
  if (!agitator) return NextResponse.json({ error: "agitator_not_found" }, { status: 404 });

  const existing = await prisma.assignment.findUnique({ where: { houseId_campaign: { houseId, campaign: "2026" } } });
  if (existing && (existing.status === "SUBMITTED" || existing.status === "ACCEPTED")) {
    return NextResponse.json({ error: "assignment_locked" }, { status: 409 });
  }

  const assignment = await prisma.assignment.upsert({
    where: { houseId_campaign: { houseId, campaign: "2026" } },
    create: { houseId, agitatorId, campaign: "2026", status: "TODO" },
    update: { agitatorId, status: "TODO" },
  });
  return NextResponse.json({ ok: true, assignmentId: assignment.id });
}
