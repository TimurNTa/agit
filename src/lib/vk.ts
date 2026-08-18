import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { randomToken, sha256 } from "@/lib/security";

export async function vkSend(peerId: number, message: string) {
  const body = new URLSearchParams({ access_token: config.vkGroupToken(), v: config.vkApiVersion, peer_id: String(peerId), random_id: String(crypto.randomInt(1, 2_000_000_000)), message });
  const response = await fetch("https://api.vk.com/method/messages.send", { method: "POST", body });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(`VK messages.send failed: ${JSON.stringify(data.error || data)}`);
}

export async function createLoginLink(agitatorId: string) {
  const raw = randomToken();
  await prisma.$transaction([
    prisma.loginToken.deleteMany({ where: { agitatorId, consumedAt: null } }),
    prisma.loginToken.create({ data: { agitatorId, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + 15 * 60_000) } }),
  ]);
  return `${config.appUrl}/api/auth/exchange?token=${encodeURIComponent(raw)}`;
}

export async function notifyHeadquarters(message: string) {
  const recipients = await prisma.notificationRecipient.findMany({ where: { active: true }, select: { vkId: true } });
  const results = await Promise.allSettled(recipients.map((recipient) => vkSend(Number(recipient.vkId), message)));
  results.forEach((result) => { if (result.status === "rejected") console.error("VK headquarters notification failed", result.reason); });
  return results.filter((result) => result.status === "fulfilled").length;
}

type VkPhoto = { sizes?: Array<{ width: number; height: number; url: string }>; orig_photo?: { url?: string } };
function bestPhotoUrl(photo: VkPhoto) {
  if (photo.orig_photo?.url) return photo.orig_photo.url;
  return [...(photo.sizes || [])].sort((a, b) => b.width * b.height - a.width * a.height)[0]?.url;
}
function extensionForMime(mime: string) {
  if (mime.includes("png")) return ".png";
  if (mime.includes("webp")) return ".webp";
  return ".jpg";
}

async function saveVkPhoto(reportId: string, photo: VkPhoto) {
  const url = bestPhotoUrl(photo);
  if (!url) throw new Error("VK photo has no downloadable URL");
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Photo download failed: ${response.status}`);
  const mimeType = response.headers.get("content-type") || "image/jpeg";
  if (!mimeType.startsWith("image/")) throw new Error("Attachment is not an image");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 20 * 1024 * 1024) throw new Error("Photo is larger than 20 MB");
  const dir = path.join(config.photoRoot, reportId);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${crypto.randomUUID()}${extensionForMime(mimeType)}`);
  await fs.writeFile(filePath, buffer, { mode: 0o640 });
  try {
    await prisma.reportPhoto.create({ data: { reportId, filePath, mimeType, sizeBytes: buffer.length, sha256: sha256(buffer) } });
  } catch (error) {
    await fs.rm(filePath, { force: true });
    throw error;
  }
}

export async function processMessageNew(payload: any) {
  const message = payload?.object?.message;
  if (!message || typeof message.from_id !== "number") return;
  const peerId = Number(message.peer_id || message.from_id);
  const agitator = await prisma.agitator.findUnique({ where: { vkId: BigInt(message.from_id) } });
  if (!agitator || !agitator.active) {
    await vkSend(peerId, `Ваш VK ID: ${message.from_id}. Вы пока не добавлены в список агитаторов.`);
    return;
  }
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  const photos = attachments.filter((item: any) => item?.type === "photo" && item.photo).map((item: any) => item.photo as VkPhoto);
  if (!photos.length) {
    const link = await createLoginLink(agitator.id);
    await vkSend(peerId, `Здравствуйте, ${agitator.name}. Откройте свою карту заданий:\n${link}\n\nСсылка действует 15 минут.`);
    return;
  }
  const report = await prisma.report.findFirst({
    where: { agitatorId: agitator.id, status: { in: ["DRAFT", "SUBMITTED"] }, createdAt: { gte: new Date(Date.now() - 20 * 60_000) } },
    orderBy: { createdAt: "desc" },
    include: { photos: { where: { deletedAt: null } }, assignment: { include: { house: true } } },
  });
  if (!report) {
    await vkSend(peerId, "Сначала откройте карту, выберите дом и нажмите «Я на месте — сдать фото», а затем пришлите фотографии сюда.");
    return;
  }
  const remaining = Math.max(0, 5 - report.photos.length);
  if (!remaining) {
    await vkSend(peerId, "К этому отчёту уже прикреплено 5 фотографий — этого достаточно.");
    return;
  }
  let saved = 0;
  for (const photo of photos.slice(0, remaining)) {
    try { await saveVkPhoto(report.id, photo); saved += 1; }
    catch (error) { console.error("saveVkPhoto", error); }
  }
  const total = report.photos.length + saved;
  if (report.status === "DRAFT" && total > 0) {
    await prisma.$transaction([
      prisma.report.update({ where: { id: report.id }, data: { status: "SUBMITTED", vkMessageId: Number(message.id || 0) || null } }),
      prisma.assignment.update({ where: { id: report.assignmentId }, data: { status: "SUBMITTED" } }),
      prisma.activityLog.create({ data: { actorType: "AGITATOR", actorId: agitator.id, actorName: agitator.name, action: "REPORT_SUBMITTED", entityType: "Report", entityId: report.id, agitatorId: agitator.id, message: `${agitator.name}: отправил отчёт по ${report.assignment.house.address}, фото — ${total}` } }),
    ]);
    await vkSend(peerId, `✅ Фото сохранены: ${total}. Отчёт отправлен на проверку.`);
    const link = `${config.appUrl}/admin?tab=reports&report=${report.id}`;
    await notifyHeadquarters(`📸 Новый отчёт AGIT\n${agitator.name}\n${report.assignment.house.address}\nФото: ${total}\n${link}`);
    return;
  }
  if (saved > 0) await vkSend(peerId, `Добавлено фото: ${saved}. Всего в отчёте: ${total}.`);
  else await vkSend(peerId, "Новые фотографии не сохранились. Возможно, они уже были отправлены — попробуйте другое фото.");
}
