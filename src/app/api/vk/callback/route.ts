import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { processMessageNew } from "@/lib/vk";
import { sha256 } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const callbackState = globalThis as unknown as { agitVkCleanupAt?: number };

function cleanupOldEvents() {
  const now = Date.now();
  if ((callbackState.agitVkCleanupAt || 0) > now - 6 * 60 * 60_000) return;
  callbackState.agitVkCleanupAt = now;
  void prisma.vkEvent.deleteMany({ where: { createdAt: { lt: new Date(now - 45 * 24 * 60 * 60_000) } } }).catch((error) => console.error("VK event cleanup", error));
}

function text(value: string, status = 200) {
  return new NextResponse(value, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

export async function POST(request: Request) {
  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return text("bad request", 400);
  }

  if (Number(payload.group_id) !== config.vkGroupId) return text("forbidden", 403);
  if (payload.secret !== config.vkCallbackSecret()) return text("forbidden", 403);

  if (payload.type === "confirmation") return text(config.vkConfirmationToken());

  const eventId = String(payload.event_id || sha256(JSON.stringify(payload)));
  try {
    await prisma.vkEvent.create({ data: { eventId, eventType: String(payload.type || "unknown") } });
  } catch {
    return text("ok");
  }
  cleanupOldEvents();

  if (payload.type === "message_new") {
    void processMessageNew(payload).catch((error) => console.error("VK message_new", error));
  }

  return text("ok");
}
