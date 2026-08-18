import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/security";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [agitators, houses, assignments, reports, activities, recipients, reportAggregates] = await Promise.all([
    prisma.agitator.findMany({ orderBy: { name: "asc" } }),
    prisma.house.findMany({ orderBy: { address: "asc" } }),
    prisma.assignment.findMany({ include: { agitator: true, house: true }, orderBy: { createdAt: "desc" } }),
    prisma.report.findMany({ include: { agitator: true, assignment: { include: { house: true } }, photos: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.activityLog.findMany({ orderBy: { createdAt: "desc" }, take: 120 }),
    prisma.notificationRecipient.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.report.groupBy({ by: ["agitatorId"], _count: { _all: true }, _avg: { distanceMeters: true }, _max: { updatedAt: true } }),
  ]);
  const stats = agitators.map((agitator) => {
    const own = assignments.filter((assignment) => assignment.agitatorId === agitator.id);
    const aggregate = reportAggregates.find((item) => item.agitatorId === agitator.id);
    const accepted = own.filter((item) => item.status === "ACCEPTED").length;
    const latest = [...own.map((item) => item.updatedAt), ...(aggregate?._max.updatedAt ? [aggregate._max.updatedAt] : [])].sort((a, b) => b.getTime() - a.getTime())[0];
    return { agitatorId: agitator.id, total: own.length, todo: own.filter((item) => item.status === "TODO").length, active: own.filter((item) => item.status === "ACTIVE").length, submitted: own.filter((item) => item.status === "SUBMITTED").length, accepted, rejected: own.filter((item) => item.status === "REJECTED").length, reports: aggregate?._count._all || 0, completionRate: own.length ? Math.round(accepted / own.length * 100) : 0, averageDistance: aggregate?._avg.distanceMeters == null ? null : Math.round(aggregate._avg.distanceMeters), lastActivityAt: latest || null };
  });
  return NextResponse.json({
    agitators: agitators.map((a) => ({ id: a.id, name: a.name, vkId: a.vkId.toString(), active: a.active })),
    houses: houses.map((house) => ({ id: house.id, address: house.address, lat: house.lat, lon: house.lon, note: house.note, source: house.source, externalId: house.externalId, createdAt: house.createdAt })),
    assignments: assignments.map((a) => ({ id: a.id, status: a.status, routeOrder: a.routeOrder, agitatorId: a.agitatorId, agitatorName: a.agitator.name, houseId: a.houseId, address: a.house.address, lat: a.house.lat, lon: a.house.lon, updatedAt: a.updatedAt })),
    reports: reports.map((r) => ({ id: r.id, status: r.status, agitatorId: r.agitatorId, agitatorName: r.agitator.name, address: r.assignment.house.address, lat: r.assignment.house.lat, lon: r.assignment.house.lon, distanceMeters: r.distanceMeters, createdAt: r.createdAt, exportedAt: r.exportedAt, reviewedAt: r.reviewedAt, reviewComment: r.reviewComment, photos: r.photos.map((p) => ({ id: p.id, sizeBytes: p.sizeBytes, createdAt: p.createdAt })) })),
    stats,
    activities: activities.map((activity) => ({ id: activity.id, actorType: activity.actorType, actorName: activity.actorName, action: activity.action, message: activity.message, agitatorId: activity.agitatorId, createdAt: activity.createdAt })),
    notificationRecipients: recipients.map((recipient) => ({ id: recipient.id, name: recipient.name, vkId: recipient.vkId.toString(), active: recipient.active })),
  });
}
