"use client";

import dynamic from "next/dynamic";
import type { AdminPoint, MapCandidate, MapCorner } from "./AdminMap";

const AdminMap = dynamic(() => import("./AdminMap").then((mod) => mod.AdminMap), { ssr: false });

export function AdminMapClient(props: {
  points: AdminPoint[];
  candidates?: MapCandidate[];
  selectedIds?: string[];
  selectedPoint?: MapCorner | null;
  areaCorners?: MapCorner[];
  pickEnabled?: boolean;
  onPick: (lat: number, lon: number) => void;
  onToggle?: (id: string) => void;
  focusPoint?: MapCorner | null;
  route?: AdminPoint[];
}) { return <AdminMap {...props} />; }
