"use client";

import dynamic from "next/dynamic";

const AdminMap = dynamic(() => import("./AdminMap").then((mod) => mod.AdminMap), { ssr: false });

export function AdminMapClient(props: { points: Array<{ id: string; lat: number; lon: number; address: string }>; onPick: (lat: number, lon: number) => void }) {
  return <AdminMap {...props} />;
}
