function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export const config = {
  appUrl: process.env.APP_URL?.trim() || "https://agit.volochek69.ru",
  photoRoot: process.env.PHOTO_STORAGE_ROOT?.trim() || "/var/lib/agit/photos",
  maxReportDistanceMeters: Number(process.env.MAX_REPORT_DISTANCE_METERS || 150),
  vkApiVersion: process.env.VK_API_VERSION?.trim() || "5.199",
  vkGroupId: Number(process.env.VK_GROUP_ID || 240908156),
  vkGroupToken: () => required("VK_GROUP_TOKEN"),
  vkCallbackSecret: () => required("VK_CALLBACK_SECRET"),
  vkConfirmationToken: () => required("VK_CONFIRMATION_TOKEN"),
  vkMessagesUrl: process.env.VK_MESSAGES_URL?.trim() || "https://vk.com/im?sel=-240908156",
  adminPassword: () => required("ADMIN_PASSWORD"),
  sessionSecret: () => required("SESSION_SECRET"),
};
