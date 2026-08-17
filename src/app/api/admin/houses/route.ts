import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/security";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const address = String(body?.address || "").trim();
  const lat = Number(body?.lat);
  const lon = Number(body?.lon);
  const agitatorId = String(body?.agitatorId || "").trim();
  if (!address || !Number.isFinite(lat) || !Number.isFinite(lon)) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const result = await prisma.$transaction(async (tx) => {
    const house = await tx.house.create({ data: { address, lat, lon, note: body?.note ? String(body.note).trim() : null } });
    const assignment = agitatorId ? await tx.assignment.create({ data: { houseId: house.id, agitatorId } }) : null;
    return { house, assignment };
  });
  return NextResponse.json({ ok: true, houseId: result.house.id, assignmentId: result.assignment?.id || null });
}
