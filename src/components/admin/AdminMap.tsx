"use client";

import { CircleMarker, MapContainer, Popup, TileLayer, useMapEvents } from "react-leaflet";

function Picker({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  useMapEvents({ click(event) { onPick(event.latlng.lat, event.latlng.lng); } });
  return null;
}

export function AdminMap({ points, onPick, selectedPoint }: {
  points: Array<{ id: string; lat: number; lon: number; address: string }>;
  onPick: (lat: number, lon: number) => void;
  selectedPoint?: { lat: number; lon: number } | null;
}) {
  const center: [number, number] = points.length ? [points[0].lat, points[0].lon] : [57.591, 34.563];
  return (
    <MapContainer center={center} zoom={15} scrollWheelZoom>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Picker onPick={onPick} />
      {selectedPoint && (
        <CircleMarker center={[selectedPoint.lat, selectedPoint.lon]} radius={10} pathOptions={{ color: "#ffffff", fillColor: "#ff7a00", fillOpacity: 1, weight: 4 }}>
          <Popup><strong>Новая точка</strong><br />Введите адрес в панели.</Popup>
        </CircleMarker>
      )}
      {points.map((point) => (
        <CircleMarker key={point.id} center={[point.lat, point.lon]} radius={7} pathOptions={{ color: "#ff7a00", fillColor: "#ff7a00", fillOpacity: .85 }}>
          <Popup><strong>{point.address}</strong></Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
