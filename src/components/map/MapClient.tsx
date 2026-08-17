"use client";

import dynamic from "next/dynamic";
import type { MapTask } from "@/components/map/types";

const AgitMap = dynamic(() => import("./AgitMap").then((mod) => mod.AgitMap), { ssr: false });

export function MapClient(props: { tasks: MapTask[]; selectedId?: string; onSelect: (id: string) => void }) {
  return <AgitMap {...props} />;
}
