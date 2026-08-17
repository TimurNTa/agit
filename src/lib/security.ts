import crypto from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";

const WORKER_COOKIE = "agit_session";
const ADMIN_COOKIE = "agit_admin";

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function sha256(value: string | Buffer) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

export async function createWorkerSession(agitatorId: string) {
  const raw = randomToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
  await prisma.webSession.create({ data: { agitatorId, tokenHash: sha256(raw), expiresAt } });
  const store = await cookies();
  store.set(WORKER_COOKIE, raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function getWorker() {
  const store = await cookies();
  const raw = store.get(WORKER_COOKIE)?.value;
  if (!raw) return null;
  const session = await prisma.webSession.findUnique({
    where: { tokenHash: sha256(raw) },
    include: { agitator: true },
  });
  if (!session || session.expiresAt <= new Date() || !session.agitator.active) return null;
  return session.agitator;
}

function adminSignature(expires: number) {
  return crypto.createHmac("sha256", config.sessionSecret()).update(String(expires)).digest("base64url");
}

export async function createAdminSession() {
  const expires = Date.now() + 1000 * 60 * 60 * 12;
  const value = `${expires}.${adminSignature(expires)}`;
  const store = await cookies();
  store.set(ADMIN_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: new Date(expires),
  });
}

export async function isAdmin() {
  const store = await cookies();
  const value = store.get(ADMIN_COOKIE)?.value;
  if (!value) return false;
  const [rawExpires, signature] = value.split(".");
  const expires = Number(rawExpires);
  if (!Number.isFinite(expires) || expires <= Date.now() || !signature) return false;
  return safeEqual(signature, adminSignature(expires));
}

export function verifyAdminPassword(password: string) {
  return safeEqual(password, config.adminPassword());
}
