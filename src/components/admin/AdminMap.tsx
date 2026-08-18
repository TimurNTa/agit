"use client";

import { useEffect } from "react";
import { AttributionControl, CircleMarker, MapContainer, Polyline, Popup, Rectangle, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { lightBasemap } from "@/components/map/basemap";

export type AdminPoint = { id: string; lat: number; lon: number; address: string; status?: string; routeOrder?: number | null; agitatorName?: string | null };
export type MapCandidate = { externalId: string; lat: number; lon: number; address: string };
export type MapCorner = { lat: number; lon: number };

const statusColors: Record<string, string> = { TODO: "#8c96a3", ACTIVE: "#ff9d40", SUBMITTED: "#f5b942", ACCEPTED: "#33c56b", REJECTED: "#ef5b5b" };

function Picker({ enabled, onPick }: { enabled: boolean; onPick: (lat: number, lon: number) => void }) {
  useMapEvents({ click(event) { if (enabled) onPick(event.latlng.lat, event.latlng.lng); } });
  return null;
}

function Focus({ point }: { point?: MapCorner | null }) {
  const map = useMap();
  useEffect(() => { if (point) map.flyTo([point.lat, point.lon], Math.max(map.getZoom(), 17), { duration: .45 }); }, [map, point]);
  return null;
}

export function AdminMap({ points, candidates = [], excludedCandidateIds = [], selectedIds = [], selectedPoint, areaCorners = [], pickEnabled = true, onPick, onToggle, onToggleCandidate, onDeletePoint, onRemoveCorner, onClearSelectedPoint, focusPoint, route = [] }: {
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
}) {
  const center: [number, number] = points.length ? [points[0].lat, points[0].lon] : [57.591, 34.563];
  const selected = new Set(selectedIds);
  const excludedCandidates = new Set(excludedCandidateIds);
  const bounds = areaCorners.length === 2 ? [[Math.min(areaCorners[0].lat, areaCorners[1].lat), Math.min(areaCorners[0].lon, areaCorners[1].lon)], [Math.max(areaCorners[0].lat, areaCorners[1].lat), Math.max(areaCorners[0].lon, areaCorners[1].lon)]] as [[number, number], [number, number]] : null;
  return <MapContainer center={center} zoom={15} scrollWheelZoom attributionControl={false}>
    <AttributionControl position="bottomright" prefix={false} />
    <TileLayer {...lightBasemap} />
    <Picker enabled={pickEnabled} onPick={onPick} />
    <Focus point={focusPoint} />
    {bounds && <Rectangle bounds={bounds} pathOptions={{ color: "#ff7a00", fillColor: "#ff7a00", fillOpacity: .08, weight: 3 }} />}
    {route.length > 1 && <Polyline positions={route.map((point) => [point.lat, point.lon])} pathOptions={{ color: "#ff7a00", weight: 4, opacity: .8 }} />}
    {areaCorners.map((corner, index) => <CircleMarker key={`corner-${index}`} center={[corner.lat, corner.lon]} radius={8} pathOptions={{ color: "#fff", fillColor: "#ff7a00", fillOpacity: 1, weight: 3 }}><Tooltip permanent direction="top">{index + 1}</Tooltip><Popup><strong>Угол территории №{index + 1}</strong>{onRemoveCorner && <button className="map-popup-danger" type="button" onClick={(event) => { event.stopPropagation(); onRemoveCorner(index); }}>Удалить точку</button>}</Popup></CircleMarker>)}
    {selectedPoint && <CircleMarker center={[selectedPoint.lat, selectedPoint.lon]} radius={10} pathOptions={{ color: "#fff", fillColor: "#ff7a00", fillOpacity: 1, weight: 4 }}><Popup><strong>Новая точка</strong>{onClearSelectedPoint && <button className="map-popup-danger" type="button" onClick={(event) => { event.stopPropagation(); onClearSelectedPoint(); }}>Убрать точку</button>}</Popup></CircleMarker>}
    {candidates.map((candidate) => {
      const excluded = excludedCandidates.has(candidate.externalId);
      return <CircleMarker key={candidate.externalId} center={[candidate.lat, candidate.lon]} radius={excluded ? 5 : 7} pathOptions={{ color: excluded ? "#7b8490" : "#fff", fillColor: excluded ? "#7b8490" : "#ff6b00", fillOpacity: excluded ? .35 : .92, weight: 2 }} bubblingMouseEvents={false}><Popup><strong>{candidate.address}</strong><span className="map-popup-note">{excluded ? "Точка исключена из добавления" : "Новый дом из OpenStreetMap"}</span>{onToggleCandidate && <button className={excluded ? "map-popup-restore" : "map-popup-danger"} type="button" onClick={(event) => { event.stopPropagation(); onToggleCandidate(candidate.externalId); }}>{excluded ? "Вернуть точку" : "Исключить точку"}</button>}</Popup></CircleMarker>;
    })}
    {points.map((point) => {
      const isSelected = selected.has(point.id);
      const color = statusColors[point.status || ""] || "#ff7a00";
      const deletable = !point.status || point.status === "TODO";
      return <CircleMarker key={point.id} center={[point.lat, point.lon]} radius={isSelected ? 10 : 7} pathOptions={{ color: isSelected ? "#fff" : color, fillColor: color, fillOpacity: .9, weight: isSelected ? 4 : 2 }} bubblingMouseEvents={false} eventHandlers={{ click: () => onToggle?.(point.id) }}>
        {point.routeOrder && <Tooltip permanent direction="top" className="route-tooltip">{point.routeOrder}</Tooltip>}
        <Popup><strong>{point.address}</strong>{point.agitatorName && <span className="map-popup-note">{point.agitatorName}</span>}{onDeletePoint && <button className="map-popup-danger" type="button" disabled={!deletable} title={deletable ? "Удалить дом с карты" : "Нельзя удалить: есть история работы"} onClick={(event) => { event.stopPropagation(); if (deletable) onDeletePoint(point.id); }}>{deletable ? "Удалить точку" : "Точка защищена историей"}</button>}</Popup>
      </CircleMarker>;
    })}
  </MapContainer>;
}
