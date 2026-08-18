import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/security";
import { discoverOsmHouses, normalizeBounds } from "@/lib/osm";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const bounds = normalizeBounds(body?.bounds);
  if (!bounds) return NextResponse.json({ error: "invalid_or_large_area" }, { status: 400 });
  try {
    const houses = await discoverOsmHouses(bounds);
    return NextResponse.json({ houses, count: houses.length });
  } catch (error) {
    console.error("OSM house discovery failed", error);
    return NextResponse.json({ error: "map_data_unavailable" }, { status: 503 });
  }
}
