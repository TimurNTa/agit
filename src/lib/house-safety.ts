type AssignmentSummary = { status: string; reportCount: number };

export function canDeleteHousePoint(assignments: AssignmentSummary[]) {
  return assignments.every((assignment) => assignment.status === "TODO" && assignment.reportCount === 0);
}
