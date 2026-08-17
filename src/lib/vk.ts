import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { randomToken, sha256 } from "@/lib/security";

export async function vkSend(peerId: number, message: string) {
  const body = new URLSearchParams({
    access_token: config.vkGroupToken(),
    v: config.vkApiVersion,
    peer_id: String(peerId),
    random_id: String(crypto.randomInt(1, 2_000_000_000)),
    message,
  });
  const response = await fetch("https://api.vk.com/method/messages.send", { method: "POST", body });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(`VK messages.send failed: ${JSON.stringify(data.error || data)}`);
}

export async function createLoginLink(agitatorId: string) {
  const raw = randomToken();
  await prisma.loginToken.create({
    data: {
      agitatorId,
      tokenHash: sha256(raw),
      expiresAt: new Date(Date.now() + 1000 * 60 * 15),
    },
  });
  return `${config.appUrl}/api/auth/exchange?token=${encodeURIComponent(raw)}`;
}

type VkPhoto = { sizes?: Array<{ width: number; height: number; url: string }>; orig_photo?: { url?: string } };

function bestPhotoUrl(photo: VkPhoto) {
  if (photo.orig_photo?.url) return photo.orig_photo.url;
  const sizes = [...(photo.sizes || [])].sort((a, b) => b.width * b.height - a.width * a.height);
  return sizes[0]?.url;
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
  const hash = sha256(buffer);
  const dir = path.join(config.photoRoot, reportId);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${crypto.randomUUID()}${extensionForMime(mimeType)}`);
  await fs.writeFile(filePath, buffer, { mode: 0o640 });
  try {
    await prisma.reportPhoto.create({
      data: { reportId, filePath, mimeType, sizeBytes: buffer.length, sha256: hash },
    });
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

  if (photos.length === 0) {
    const link = await createLoginLink(agitator.id);
    await vkSend(peerId, `Здравствуйте, ${agitator.name}. Откройте свою карту заданий:\n${link}\n\nСсылка действует 15 минут.`);
    return;
  }

  const cutoff = new Date(Date.now() - 1000 * 60 * 20);
  const report = await prisma.report.findFirst({
    where: {
      agitatorId: agitator.id,
      status: { in: ["DRAFT", "SUBMITTED"] },
      createdAt: { gte: cutoff },
    },
    orderBy: { createdAt: "desc" },
    include: { photos: { where: { deletedAt: null } } },
  });

  if (!report) {
    await vkSend(peerId, "Сначала откройте карту, выберите дом и нажмите «Сделал — отправить фото», а затем пришлите фотографии сюда.");
    return;
  }

  const remaining = Math.max(0, 5 - report.photos.length);
  if (remaining === 0) {
    await vkSend(peerId, "К этому отчёту уже прикреплено 5 фотографий — этого достаточно.");
    return;
  }

  let saved = 0;
  for (const photo of photos.slice(0, remaining)) {
    try {
      await saveVkPhoto(report.id, photo);
      saved += 1;
    } catch (error: any) {
      if (!String(error?.message || "").includes("Unique constraint")) console.error("saveVkPhoto", error);
    }
  }

  if (saved > 0) {
    await prisma.$transaction([
      prisma.report.update({ where: { id: report.id }, data: { status: "SUBMITTED", vkMessageId: Number(message.id || 0) || null } }),
      prisma.assignment.update({ where: { id: report.assignmentId }, data: { status: "SUBMITTED" } }),
    ]);
    await vkSend(peerId, `Фото сохранены: ${saved}. Отчёт отправлен на проверку.`);
  }
}
