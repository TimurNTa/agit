"use client";

import dynamic from "next/dynamic";
import type { AdminPoint, MapCandidate, MapCorner } from "./AdminMap";

const AdminMap = dynamic(() => import("./AdminMap").then((mod) => mod.AdminMap), { ssr: false });

export function AdminMapClient(props: {
  points: AdminPoint[];
  candidates?: MapCandidate[];
  excludedCandidateIds?: string[];
  selectedIds?: string[];
  selectedPoint?: MapCorner | null;
  areaCorners?: MapCorner[];
  pickEnabled?: boolean;
  onPick: (lat: number, lon: number) => void;
  onToggle?: (id: string) => void;
  onToggleCandidate?: (id: string) => void;
  onDeletePoint?: (id: string) => void;
  onRemoveCorner?: (index: number) => void;
  onClearSelectedPoint?: () => void;
  focusPoint?: MapCorner | null;
  route?: AdminPoint[];
}) { return <AdminMap {...props} />; }
