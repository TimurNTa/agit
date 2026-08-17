import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createWorkerSession, sha256 } from "@/lib/security";
import { config } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("token") || "";
  const token = raw ? await prisma.loginToken.findUnique({ where: { tokenHash: sha256(raw) } }) : null;
  if (!token || token.consumedAt || token.expiresAt <= new Date()) {
    return NextResponse.redirect(new URL("/?login=expired", config.appUrl));
  }
  await prisma.$transaction([
    prisma.loginToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } }),
    prisma.webSession.deleteMany({ where: { agitatorId: token.agitatorId, expiresAt: { lt: new Date() } } }),
  ]);
  await createWorkerSession(token.agitatorId);
  return NextResponse.redirect(new URL("/", config.appUrl));
}
