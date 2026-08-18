import { prisma } from "@/lib/prisma";

type ActivityInput = {
  actorType: "ADMIN" | "AGITATOR" | "SYSTEM";
  actorId?: string | null;
  actorName: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  message: string;
  agitatorId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
};

export async function logActivity(input: ActivityInput) {
  return prisma.activityLog.create({ data: { ...input, metadata: input.metadata } });
}
