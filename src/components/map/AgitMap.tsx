"use client";

import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import type { MapTask } from "@/components/map/types";

const colors: Record<MapTask["status"], string> = {
  TODO: "#8c96a3",
  ACTIVE: "#ff9d40",
  SUBMITTED: "#f5b942",
  ACCEPTED: "#33c56b",
  REJECTED: "#ef5b5b",
};

export function AgitMap({ tasks, selectedId, onSelect }: { tasks: MapTask[]; selectedId?: string; onSelect: (id: string) => void }) {
  const center: [number, number] = tasks.length ? [tasks[0].lat, tasks[0].lon] : [57.591, 34.563];
  return (
    <MapContainer center={center} zoom={14} scrollWheelZoom zoomControl>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {tasks.map((task) => (
        <CircleMarker
          key={task.id}
          center={[task.lat, task.lon]}
          radius={selectedId === task.id ? 11 : 8}
          pathOptions={{ color: colors[task.status], fillColor: colors[task.status], fillOpacity: .92, weight: selectedId === task.id ? 4 : 2 }}
          eventHandlers={{ click: () => onSelect(task.id) }}
        >
          <Popup>
            <strong>{task.address}</strong><br />
            {task.note || "Задание"}
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
