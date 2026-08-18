"use client";

import { useEffect } from "react";
import { AttributionControl, CircleMarker, MapContainer, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { MapTask } from "@/components/map/types";
import { lightBasemap } from "@/components/map/basemap";

const colors: Record<MapTask["status"], string> = {
  TODO: "#8c96a3",
  ACTIVE: "#ff9d40",
  SUBMITTED: "#f5b942",
  ACCEPTED: "#33c56b",
  REJECTED: "#ef5b5b",
};

function Viewport({ tasks, selectedId, userLocation }: { tasks: MapTask[]; selectedId?: string; userLocation?: { lat: number; lon: number } }) {
  const map = useMap();

  useEffect(() => {
    const selected = tasks.find((task) => task.id === selectedId);
    if (selected) map.flyTo([selected.lat, selected.lon], Math.max(map.getZoom(), 16), { duration: .45 });
  }, [map, selectedId, tasks]);

  useEffect(() => {
    if (userLocation) map.flyTo([userLocation.lat, userLocation.lon], Math.max(map.getZoom(), 16), { duration: .45 });
  }, [map, userLocation]);

  return null;
}

export function AgitMap({ tasks, selectedId, onSelect, userLocation }: {
  tasks: MapTask[];
  selectedId?: string;
  onSelect: (id: string) => void;
  userLocation?: { lat: number; lon: number };
}) {
  const center: [number, number] = tasks.length ? [tasks[0].lat, tasks[0].lon] : [57.591, 34.563];
  const route = tasks.filter((task) => task.status !== "ACCEPTED" && task.status !== "SUBMITTED");
  return (
    <MapContainer center={center} zoom={15} scrollWheelZoom zoomControl attributionControl={false}>
      <AttributionControl position="bottomright" prefix={false} />
      <TileLayer {...lightBasemap} />
      <Viewport tasks={tasks} selectedId={selectedId} userLocation={userLocation} />
      {route.length > 1 && <Polyline positions={route.map((task) => [task.lat, task.lon])} pathOptions={{ color: "#ff7a00", weight: 4, opacity: .78 }} />}
      {userLocation && (
        <CircleMarker center={[userLocation.lat, userLocation.lon]} radius={9} pathOptions={{ color: "#ffffff", fillColor: "#111111", fillOpacity: 1, weight: 3 }}>
          <Popup><strong>Вы здесь</strong></Popup>
        </CircleMarker>
      )}
      {tasks.map((task) => (
        <CircleMarker
          key={task.id}
          center={[task.lat, task.lon]}
          radius={selectedId === task.id ? 11 : 8}
          pathOptions={{ color: selectedId === task.id ? "#ffffff" : colors[task.status], fillColor: colors[task.status], fillOpacity: .94, weight: selectedId === task.id ? 4 : 2 }}
          eventHandlers={{ click: () => onSelect(task.id) }}
        >
          {task.routeOrder && task.status !== "ACCEPTED" && <Tooltip permanent direction="top" className="route-tooltip">{task.routeOrder}</Tooltip>}
          <Popup>
            <strong>{task.address}</strong>
            <span className="map-popup-note">{task.note || "Задание"}</span>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
