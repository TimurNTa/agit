import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/security";
import { searchAddress } from "@/lib/osm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const query = new URL(request.url).searchParams.get("q")?.replace(/\s+/g, " ").trim() || "";
  if (query.length < 3 || query.length > 160) return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  try {
    return NextResponse.json({ results: await searchAddress(query) });
  } catch (error) {
    console.error("Address search failed", error);
    return NextResponse.json({ error: "geocoder_unavailable" }, { status: 503 });
  }
}
