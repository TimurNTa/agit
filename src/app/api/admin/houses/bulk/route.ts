import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

type HouseInput = { address?: unknown; lat?: unknown; lon?: unknown; source?: unknown; externalId?: unknown; note?: unknown };

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const raw = Array.isArray(body?.houses) ? body.houses as HouseInput[] : [];
  if (!raw.length || raw.length > 500) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const parsed = raw.flatMap((item) => {
    const address = String(item.address || "").replace(/\s+/g, " ").trim().slice(0, 240);
    const lat = Number(item.lat);
    const lon = Number(item.lon);
    const source = String(item.source || "manual").trim().slice(0, 30);
    const externalId = String(item.externalId || "").trim().slice(0, 120);
    const note = String(item.note || "").trim().slice(0, 500) || null;
    if (!address || !Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180 || !source || !externalId) return [];
    return [{ address, lat, lon, source, externalId, note }];
  });
  if (!parsed.length) return NextResponse.json({ error: "no_valid_houses" }, { status: 400 });
  const seenKeys = new Set<string>();
  const seenAddresses = new Set<string>();
  const unique = parsed.filter((house) => {
    const key = `${house.source}:${house.externalId}`;
    const address = house.address.toLocaleLowerCase("ru");
    if (seenKeys.has(key) || seenAddresses.has(address)) return false;
    seenKeys.add(key); seenAddresses.add(address); return true;
  });
  const addressList = unique.map((house) => house.address);
  const existing = await prisma.house.findMany({
    where: { OR: [
      ...unique.map((house) => ({ source: house.source, externalId: house.externalId })),
      { address: { in: addressList, mode: "insensitive" } },
    ] },
    select: { id: true, address: true, source: true, externalId: true },
  });
  const existingKeys = new Set(existing.map((house) => `${house.source}:${house.externalId}`));
  const existingAddresses = new Set(existing.map((house) => house.address.toLocaleLowerCase("ru")));
  const fresh = unique.filter((house) => !existingKeys.has(`${house.source}:${house.externalId}`) && !existingAddresses.has(house.address.toLocaleLowerCase("ru")));
  const created = fresh.length ? await prisma.house.createMany({ data: fresh, skipDuplicates: true }) : { count: 0 };
  const saved = await prisma.house.findMany({
    where: { OR: [
      ...unique.map((house) => ({ source: house.source, externalId: house.externalId })),
      { address: { in: addressList, mode: "insensitive" } },
    ] },
    select: { id: true, address: true, lat: true, lon: true, source: true, externalId: true, note: true },
  });
  await logActivity({ actorType: "ADMIN", actorName: "Штаб", action: "HOUSES_IMPORTED", entityType: "House", message: `Импортировано домов: ${created.count}; уже были на карте: ${unique.length - created.count}`, metadata: { created: created.count, existing: unique.length - created.count } });
  return NextResponse.json({ ok: true, created: created.count, existing: unique.length - created.count, houses: saved });
}
