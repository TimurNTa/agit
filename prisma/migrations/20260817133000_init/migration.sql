CREATE TYPE "AssignmentStatus" AS ENUM ('TODO', 'ACTIVE', 'SUBMITTED', 'ACCEPTED', 'REJECTED');
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'ACCEPTED', 'REJECTED');

CREATE TABLE "Agitator" (
  "id" TEXT NOT NULL,
  "vkId" BIGINT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Agitator_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Agitator_vkId_key" ON "Agitator"("vkId");

CREATE TABLE "House" (
  "id" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "lat" DOUBLE PRECISION NOT NULL,
  "lon" DOUBLE PRECISION NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "House_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "House_address_idx" ON "House"("address");

CREATE TABLE "Assignment" (
  "id" TEXT NOT NULL,
  "agitatorId" TEXT NOT NULL,
  "houseId" TEXT NOT NULL,
  "campaign" TEXT NOT NULL DEFAULT '2026',
  "status" "AssignmentStatus" NOT NULL DEFAULT 'TODO',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Assignment_houseId_campaign_key" ON "Assignment"("houseId", "campaign");
CREATE INDEX "Assignment_agitatorId_status_idx" ON "Assignment"("agitatorId", "status");
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_agitatorId_fkey" FOREIGN KEY ("agitatorId") REFERENCES "Agitator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_houseId_fkey" FOREIGN KEY ("houseId") REFERENCES "House"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Report" (
  "id" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "agitatorId" TEXT NOT NULL,
  "lat" DOUBLE PRECISION NOT NULL,
  "lon" DOUBLE PRECISION NOT NULL,
  "accuracyMeters" DOUBLE PRECISION,
  "distanceMeters" INTEGER NOT NULL,
  "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
  "vkMessageId" INTEGER,
  "exportedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Report_agitatorId_status_createdAt_idx" ON "Report"("agitatorId", "status", "createdAt");
CREATE INDEX "Report_assignmentId_createdAt_idx" ON "Report"("assignmentId", "createdAt");
ALTER TABLE "Report" ADD CONSTRAINT "Report_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_agitatorId_fkey" FOREIGN KEY ("agitatorId") REFERENCES "Agitator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ReportPhoto" (
  "id" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "filePath" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReportPhoto_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReportPhoto_reportId_deletedAt_idx" ON "ReportPhoto"("reportId", "deletedAt");
CREATE UNIQUE INDEX "ReportPhoto_reportId_sha256_key" ON "ReportPhoto"("reportId", "sha256");
ALTER TABLE "ReportPhoto" ADD CONSTRAINT "ReportPhoto_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "LoginToken" (
  "id" TEXT NOT NULL,
  "agitatorId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoginToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LoginToken_tokenHash_key" ON "LoginToken"("tokenHash");
ALTER TABLE "LoginToken" ADD CONSTRAINT "LoginToken_agitatorId_fkey" FOREIGN KEY ("agitatorId") REFERENCES "Agitator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WebSession" (
  "id" TEXT NOT NULL,
  "agitatorId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WebSession_tokenHash_key" ON "WebSession"("tokenHash");
CREATE INDEX "WebSession_agitatorId_expiresAt_idx" ON "WebSession"("agitatorId", "expiresAt");
ALTER TABLE "WebSession" ADD CONSTRAINT "WebSession_agitatorId_fkey" FOREIGN KEY ("agitatorId") REFERENCES "Agitator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "VkEvent" (
  "eventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VkEvent_pkey" PRIMARY KEY ("eventId")
);
