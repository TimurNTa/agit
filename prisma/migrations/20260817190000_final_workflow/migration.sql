-- Additive migration: existing houses, assignments and reports remain valid.
ALTER TABLE "House"
  ADD COLUMN "source" TEXT,
  ADD COLUMN "externalId" TEXT;

ALTER TABLE "Assignment"
  ADD COLUMN "routeOrder" INTEGER;

ALTER TABLE "Report"
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewComment" TEXT;

CREATE TABLE "NotificationRecipient" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "vkId" BIGINT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationRecipient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ActivityLog" (
  "id" TEXT NOT NULL,
  "actorType" TEXT NOT NULL,
  "actorId" TEXT,
  "actorName" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "message" TEXT NOT NULL,
  "metadata" JSONB,
  "agitatorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "House_source_externalId_key" ON "House"("source", "externalId");
CREATE INDEX "Assignment_agitatorId_routeOrder_idx" ON "Assignment"("agitatorId", "routeOrder");
CREATE UNIQUE INDEX "NotificationRecipient_vkId_key" ON "NotificationRecipient"("vkId");
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");
CREATE INDEX "ActivityLog_agitatorId_createdAt_idx" ON "ActivityLog"("agitatorId", "createdAt");

ALTER TABLE "ActivityLog"
  ADD CONSTRAINT "ActivityLog_agitatorId_fkey"
  FOREIGN KEY ("agitatorId") REFERENCES "Agitator"("id") ON DELETE SET NULL ON UPDATE CASCADE;
