"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowDownAZ, ArrowDownUp, ArrowRightLeft, Camera, ClipboardList, History, HousePlus, LocateFixed, LogOut, Map as MapIcon, MapPinned, Menu, Route as RouteIcon, RotateCcw, Settings2, Trash2, Users } from "lucide-react";
import { AdminMapClient } from "@/components/admin/AdminMapClient";
import type { MapCandidate, MapCorner } from "@/components/admin/AdminMap";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";

type Tab = "overview" | "territory" | "tasks" | "team" | "reports" | "history";
type House = { id: string; address: string; lat: number; lon: number; note?: string | null; source?: string | null; externalId?: string | null };
type Assignment = { id: string; status: string; routeOrder?: number | null; agitatorId: string; agitatorName: string; houseId: string; address: string; lat: number; lon: number };
type Report = { id: string; status: string; agitatorId: string; agitatorName: string; address: string; distanceMeters: number; createdAt: string; exportedAt?: string | null; reviewComment?: string | null; photos: Array<{ id: string }> };
type Data = {
  agitators: Array<{ id: string; name: string; vkId: string; active: boolean }>;
  houses: House[];
  assignments: Assignment[];
  reports: Report[];
  stats: Array<{ agitatorId: string; total: number; todo: number; active: number; submitted: number; accepted: number; rejected: number; reports: number; completionRate: number; averageDistance?: number | null; lastActivityAt?: string | null }>;
  activities: Array<{ id: string; actorName: string; action: string; message: string; createdAt: string }>;
  notificationRecipients: Array<{ id: string; name: string; vkId: string; active: boolean }>;
};
type SearchResult = { label: string; address: string; lat: number; lon: number; type: string };
type RouteStrategy = "nearest" | "address";

const statusText: Record<string, string> = { TODO: "Не начато", ACTIVE: "В работе", SUBMITTED: "На проверке", ACCEPTED: "Принято", REJECTED: "Переделать" };
const validTabs = new Set<Tab>(["overview", "territory", "tasks", "team", "reports", "history"]);
const normalizedAddress = (value: string) => value.toLocaleLowerCase("ru").replaceAll("ё", "е").replace(/[.]/g, "").replace(/\s+/g, " ").trim();

export function AdminDashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<{ text: string; danger?: boolean }>();
  const [loadError, setLoadError] = useState<string>();
  const [tab, setTab] = useState<Tab>("territory");
  const [pickMode, setPickMode] = useState<"area" | "house">("area");
  const [areaCorners, setAreaCorners] = useState<MapCorner[]>([]);
  const [candidates, setCandidates] = useState<MapCandidate[]>([]);
  const [excludedCandidateIds, setExcludedCandidateIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [coords, setCoords] = useState<MapCorner | null>(null);
  const [manualAddress, setManualAddress] = useState("");
  const [territoryAgitator, setTerritoryAgitator] = useState("");
  const [routeAgitator, setRouteAgitator] = useState("");
  const [routeStrategy, setRouteStrategy] = useState<RouteStrategy>("nearest");
  const [routeTarget, setRouteTarget] = useState("");
  const [routeBusy, setRouteBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [focusPoint, setFocusPoint] = useState<MapCorner | null>(null);
  const [taskQuery, setTaskQuery] = useState("");
  const [bulkAgitator, setBulkAgitator] = useState("");
  const [reportQuery, setReportQuery] = useState("");
  const [reportFilter, setReportFilter] = useState("SUBMITTED");
  const [rejectingId, setRejectingId] = useState<string>();
  const [rejectComment, setRejectComment] = useState("");
  const [highlightReportId, setHighlightReportId] = useState<string>();
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);

  function show(text: string, danger = false) { setNotice({ text, danger }); }
  function goTab(next: Tab) { setTab(next); const url = new URL(window.location.href); url.searchParams.set("tab", next); url.searchParams.delete("report"); window.history.replaceState(null, "", url); }

  async function load(silent = false) {
    if (!silent) setLoadError(undefined);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch("/api/admin/data", { cache: "no-store", signal: controller.signal });
      if (response.status === 401) { setData(null); setNeedsLogin(true); return; }
      if (!response.ok) throw new Error(`admin_data_${response.status}`);
      setData(await response.json()); setNeedsLogin(false);
    } catch (error) {
      console.error("Admin data load failed", error);
      setLoadError("Не удалось загрузить данные штаба. Проверьте сервис и повторите.");
    } finally { window.clearTimeout(timeout); }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("tab") as Tab | null;
    if (requested && validTabs.has(requested)) setTab(requested === "overview" ? "territory" : requested);
    const report = params.get("report");
    if (report) { setTab("reports"); setHighlightReportId(report); setReportFilter("all"); }
    void load();
    const timer = window.setInterval(() => void load(true), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const assignmentByHouse = useMemo(() => new Map((data?.assignments || []).map((item) => [item.houseId, item])), [data]);
  const mapPoints = useMemo(() => (data?.houses || []).map((house) => { const assignment = assignmentByHouse.get(house.id); return { ...house, status: assignment?.status, routeOrder: assignment?.routeOrder, agitatorName: assignment?.agitatorName }; }), [data, assignmentByHouse]);
  const routeAssignments = useMemo(() => (data?.assignments || []).filter((item) => item.agitatorId === routeAgitator && !["SUBMITTED", "ACCEPTED"].includes(item.status)).sort((a, b) => (a.routeOrder ?? 999999) - (b.routeOrder ?? 999999)), [data, routeAgitator]);
  const route = useMemo(() => routeAssignments.map((item) => ({ id: item.houseId, address: item.address, lat: item.lat, lon: item.lon, status: item.status, routeOrder: item.routeOrder, agitatorName: item.agitatorName })), [routeAssignments]);
  const pendingReports = data?.reports.filter((report) => report.status === "SUBMITTED").length || 0;
  const accepted = data?.assignments.filter((item) => item.status === "ACCEPTED").length || 0;
  const activeAgitators = data?.agitators.filter((item) => item.active) || [];
  const filteredTasks = (data?.houses || []).filter((house) => house.address.toLocaleLowerCase("ru").includes(taskQuery.toLocaleLowerCase("ru")));
  const filteredReports = (data?.reports || []).filter((report) => (reportFilter === "all" || report.status === reportFilter) && `${report.address} ${report.agitatorName}`.toLocaleLowerCase("ru").includes(reportQuery.toLocaleLowerCase("ru"))).sort((a, b) => (a.id === highlightReportId ? -1 : b.id === highlightReportId ? 1 : 0));
  const includedCandidates = candidates.filter((candidate) => !excludedCandidateIds.includes(candidate.externalId));

  async function login(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
    if (!response.ok) { show(response.status === 429 ? "Слишком много попыток. Подождите 15 минут." : "Неверный пароль", true); return; }
    setPassword(""); setNotice(undefined); await load();
  }
  async function logout() { await fetch("/api/admin/logout", { method: "POST" }); window.location.reload(); }

  async function addAgitator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formEl = event.currentTarget; const form = new FormData(formEl);
    const response = await fetch("/api/admin/agitators", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.get("name"), vkId: form.get("vkId") }) });
    const body = await response.json().catch(() => ({}));
    show(response.ok ? "Агитатор добавлен" : body.error === "vk_id_exists" ? "Этот VK ID уже добавлен" : "Не удалось добавить агитатора", !response.ok);
    if (response.ok) { formEl.reset(); await load(true); }
  }
  async function toggleAgitator(id: string, active: boolean) { const response = await fetch("/api/admin/agitators", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, active }) }); show(response.ok ? (active ? "Доступ включён" : "Доступ приостановлен") : "Не удалось изменить доступ", !response.ok); if (response.ok) await load(true); }

  function cornersToBounds(corners: MapCorner[]) { return { south: Math.min(corners[0].lat, corners[1].lat), west: Math.min(corners[0].lon, corners[1].lon), north: Math.max(corners[0].lat, corners[1].lat), east: Math.max(corners[0].lon, corners[1].lon) }; }
  async function discover(corners: MapCorner[]) {
    setBusy(true); setCandidates([]); setExcludedCandidateIds([]);
    const bounds = cornersToBounds(corners);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 58_000);
    try {
      const response = await fetch("/api/admin/houses/discover", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bounds }), signal: controller.signal });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        show(result.error === "invalid_or_large_area" ? "Участок слишком большой. Выделите квартал поменьше." : "Сервисы OpenStreetMap сейчас не ответили. Нажмите «Повторить поиск домов».", true);
        return;
      }
      const excludedAddresses = new Set<string>((result.excludedAddresses || []).map((address: string) => normalizedAddress(address)));
      const knownExternalIds = new Set((data?.houses || []).map((house) => house.externalId).filter(Boolean));
      const knownAddresses = new Set((data?.houses || []).map((house) => normalizedAddress(house.address)));
      const newCandidates: MapCandidate[] = (result.houses || []).filter((house: MapCandidate) => !knownExternalIds.has(house.externalId) && !knownAddresses.has(normalizedAddress(house.address)));
      setCandidates(newCandidates);
      const inside = (data?.houses || []).filter((house) => house.lat >= bounds.south && house.lat <= bounds.north && house.lon >= bounds.west && house.lon <= bounds.east && !excludedAddresses.has(normalizedAddress(house.address))).map((house) => house.id);
      setSelectedIds(inside);
      const details = [`жилых: ${result.count || 0}`, `новых: ${newCandidates.length}`, `уже в AGIT: ${inside.length}`, `исключено нежилых: ${result.excludedCount || 0}`];
      if (result.unresolvedCount) details.push(`без полного адреса: ${result.unresolvedCount}`);
      if (result.stale) details.push("использована сохранённая копия");
      if (result.truncated) details.push("показаны первые 500 — уменьшите участок");
      show(`Готово — ${details.join(" · ")}`, Boolean(result.truncated));
      if (window.matchMedia("(max-width: 900px)").matches) setMobilePanelOpen(true);
    } catch (error) {
      console.error("OSM discovery request failed", error);
      show("Сервисы OpenStreetMap сейчас не ответили. Нажмите «Повторить поиск домов».", true);
    } finally {
      window.clearTimeout(timeout);
      setBusy(false);
    }
  }
  function mapPick(lat: number, lon: number) {
    if (pickMode === "house") { setCoords({ lat, lon }); setFocusPoint({ lat, lon }); return; }
    const next = areaCorners.length >= 2 ? [{ lat, lon }] : [...areaCorners, { lat, lon }];
    setAreaCorners(next); setCandidates([]); setExcludedCandidateIds([]);
    if (next.length === 2) void discover(next);
  }
  function toggleSelected(id: string) { setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }
  function toggleCandidate(id: string) { setExcludedCandidateIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }
  function resetTerritory() { setAreaCorners([]); setCandidates([]); setExcludedCandidateIds([]); setSelectedIds([]); setTerritoryAgitator(""); }

  async function assignHouses(houseIds: string[], agitatorId: string, buildRoute = false) {
    if (!houseIds.length || !agitatorId) { show("Выберите дома и агитатора", true); return false; }
    const response = await fetch("/api/admin/assignments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ houseIds, agitatorId }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { show("Не удалось назначить территорию", true); return false; }
    if (!result.changed) { show("Назначение не изменено: выбранные задания уже защищены отчётами", true); return false; }
    if (buildRoute) await fetch("/api/admin/routes/optimize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agitatorId }) });
    show(`Назначено домов: ${result.changed}${result.locked ? `; защищено отчётами: ${result.locked}` : ""}${buildRoute ? ". Маршрут построен." : ""}`);
    setRouteAgitator(agitatorId); await load(true); return true;
  }
  async function finalizeTerritory() {
    if (!territoryAgitator || (!includedCandidates.length && !selectedIds.length)) { show("Выберите агитатора и территорию", true); return; }
    setBusy(true);
    let ids = [...selectedIds];
    if (includedCandidates.length) {
      const response = await fetch("/api/admin/houses/bulk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ houses: includedCandidates.map((house) => ({ ...house, source: "osm" })) }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { show("Не удалось импортировать дома", true); setBusy(false); return; }
      ids = [...new Set([...ids, ...(result.houses || []).map((house: House) => house.id)])];
    }
    const ok = await assignHouses(ids, territoryAgitator, true);
    if (ok) { resetTerritory(); setMobilePanelOpen(false); }
    setBusy(false);
  }
  async function optimizeRoute(agitatorId: string, strategy: RouteStrategy | "reverse" = routeStrategy, fromCurrentLocation = false) {
    if (!agitatorId || routeBusy) return;
    setRouteBusy(true);
    try {
      let start: { startLat?: number; startLon?: number } = {};
      if (fromCurrentLocation) {
        if (!navigator.geolocation) throw new Error("geolocation_unavailable");
        const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 }));
        start = { startLat: position.coords.latitude, startLon: position.coords.longitude };
      }
      const response = await fetch("/api/admin/routes/optimize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agitatorId, strategy, ...start }) });
      const result = await response.json().catch(() => ({}));
      const action = strategy === "reverse" ? "развёрнут" : strategy === "address" ? "отсортирован по адресам" : fromCurrentLocation ? "построен от вашего места" : "оптимизирован";
      show(response.ok ? `Маршрут ${action}: ${result.changed || 0} домов` : "Не удалось изменить маршрут", !response.ok);
      setRouteAgitator(agitatorId);
      if (response.ok) await load(true);
    } catch {
      show(fromCurrentLocation ? "Не удалось определить ваше местоположение. Разрешите геолокацию и повторите." : "Не удалось изменить маршрут", true);
    } finally { setRouteBusy(false); }
  }

  async function removeAssignments(houseIds: string[], confirmText?: string) {
    if (!houseIds.length || routeBusy) return false;
    if (confirmText && !window.confirm(confirmText)) return false;
    setRouteBusy(true);
    try {
      const response = await fetch("/api/admin/assignments", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ houseIds }) });
      const result = await response.json().catch(() => ({}));
      show(response.ok ? `Снято назначений: ${result.changed || 0}${result.locked ? `. Защищено историей: ${result.locked}` : ""}` : "Не удалось снять назначения", !response.ok);
      if (response.ok) { setSelectedIds([]); await load(true); }
      return response.ok;
    } finally { setRouteBusy(false); }
  }

  async function clearRoute(agitatorId: string) {
    if (!data || !agitatorId || routeBusy) return;
    const agitator = data.agitators.find((item) => item.id === agitatorId);
    const stat = data.stats.find((item) => item.agitatorId === agitatorId);
    const removable = stat?.todo || 0;
    const protectedCount = Math.max(0, (stat?.total || 0) - removable);
    if (!removable) { show("В этом маршруте нет назначений, которые можно безопасно снять", true); return; }
    if (!window.confirm(`Снять ${removable} не начатых домов у ${agitator?.name || "агитатора"}?${protectedCount ? ` Ещё ${protectedCount} заданий с историей останутся.` : ""}`)) return;
    setRouteBusy(true);
    try {
      const response = await fetch("/api/admin/assignments", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ agitatorId }) });
      const result = await response.json().catch(() => ({}));
      show(response.ok ? `Маршрут очищен: снято ${result.changed || 0}${result.locked ? `, сохранено с историей ${result.locked}` : ""}` : "Не удалось очистить маршрут", !response.ok);
      if (response.ok) await load(true);
    } finally { setRouteBusy(false); }
  }

  async function clearAllRoutes() {
    if (!data || routeBusy) return;
    const removable = data.stats.reduce((sum, stat) => sum + stat.todo, 0);
    const protectedCount = Math.max(0, data.assignments.length - removable);
    if (!removable) { show("Нет не начатых назначений для очистки", true); return; }
    if (!window.confirm(`Снять все ${removable} не начатых назначений у всей команды?${protectedCount ? ` ${protectedCount} заданий с историей останутся.` : ""}`)) return;
    setRouteBusy(true);
    try {
      const response = await fetch("/api/admin/assignments", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ all: true }) });
      const result = await response.json().catch(() => ({}));
      show(response.ok ? `Свободные маршруты очищены: снято ${result.changed || 0}${result.locked ? `, сохранено с историей ${result.locked}` : ""}` : "Не удалось очистить маршруты", !response.ok);
      if (response.ok) await load(true);
    } finally { setRouteBusy(false); }
  }

  async function transferRoute() {
    if (!data || !routeAgitator || !routeTarget || routeAgitator === routeTarget || routeBusy) return;
    const source = data.agitators.find((item) => item.id === routeAgitator)?.name || "агитатора";
    const target = data.agitators.find((item) => item.id === routeTarget)?.name || "другому агитатору";
    const editableHouseIds = routeAssignments.filter((item) => item.status === "TODO").map((item) => item.houseId);
    if (!editableHouseIds.length) { show("В маршруте нет не начатых домов для переноса", true); return; }
    if (!window.confirm(`Перенести ${editableHouseIds.length} не начатых домов от ${source} к ${target}?`)) return;
    setRouteBusy(true);
    try {
      const ok = await assignHouses(editableHouseIds, routeTarget, true);
      if (ok) { setRouteAgitator(routeTarget); setRouteTarget(""); }
    } finally { setRouteBusy(false); }
  }

  async function searchAddress(event: FormEvent) { event.preventDefault(); if (search.trim().length < 3) return; setSearching(true); const response = await fetch(`/api/admin/geocode?q=${encodeURIComponent(search)}`); const result = await response.json().catch(() => ({})); setSearchResults(response.ok ? result.results || [] : []); if (!response.ok) show("Поиск адреса временно недоступен", true); setSearching(false); }
  function chooseSearch(result: SearchResult) { setManualAddress(result.address); setCoords({ lat: result.lat, lon: result.lon }); setFocusPoint({ lat: result.lat, lon: result.lon }); setSearchResults([]); setPickMode("house"); }
  async function addHouse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!coords) { show("Сначала выберите точку на карте", true); return; }
    const formEl = event.currentTarget; const form = new FormData(formEl);
    const response = await fetch("/api/admin/houses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: manualAddress, note: form.get("note"), agitatorId: form.get("agitatorId"), lat: coords.lat, lon: coords.lon }) });
    const result = await response.json().catch(() => ({}));
    show(response.ok ? "Дом добавлен" : result.error === "house_exists" ? "Такой адрес уже есть на карте" : "Не удалось добавить дом", !response.ok);
    if (response.ok) { formEl.reset(); setManualAddress(""); setCoords(null); await load(true); }
  }
  async function assignOne(houseId: string, agitatorId: string) { const response = await fetch("/api/admin/assignments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ houseId, agitatorId }) }); const result = await response.json().catch(() => ({})); show(response.ok && result.changed ? "Назначение сохранено" : response.ok ? "Задание защищено историей отчёта" : "Не удалось изменить назначение", !response.ok || !result.changed); if (response.ok) await load(true); }

  async function reportAction(id: string, action: "accept" | "reject", comment = "") { const response = await fetch(`/api/admin/reports/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, comment }) }); const result = await response.json().catch(() => ({})); show(response.ok ? `${action === "accept" ? "Отчёт принят" : "Отчёт отправлен на переделку"}${result.notificationSent === false ? ", но VK-уведомление не доставлено" : ""}` : "Не удалось обработать отчёт", !response.ok); if (response.ok) { setRejectingId(undefined); setRejectComment(""); setHighlightReportId(undefined); await load(true); } }
  async function confirmExport() { const response = await fetch("/api/admin/export/confirm", { method: "POST" }); const result = await response.json(); show(`Отмечено выгруженными отчётов: ${result.marked || 0}`); await load(true); }
  async function deleteExported() { if (!window.confirm("Удалить с сервера фотографии всех подтверждённо выгруженных отчётов?")) return; const response = await fetch("/api/admin/photos/delete-exported", { method: "POST" }); const result = await response.json(); show(`Удалено файлов: ${result.deleted || 0}`); await load(true); }
  async function addRecipient(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const formEl = event.currentTarget; const form = new FormData(formEl); const response = await fetch("/api/admin/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.get("name"), vkId: form.get("vkId") }) }); const result = await response.json().catch(() => ({})); show(response.ok ? (result.testSent ? "Уведомления включены, тест отправлен" : "Получатель сохранён, но тестовое сообщение не доставлено") : "Не удалось включить уведомления", !response.ok || result.testSent === false); if (response.ok) { formEl.reset(); await load(true); } }

  function renderTerritoryControls() {
    return <div className="territory-panel">
      <TabsList className="territory-mode-tabs">
        <TabsTrigger active={pickMode === "area"} onClick={() => setPickMode("area")}><MapPinned size={16} />Территория</TabsTrigger>
        <TabsTrigger active={pickMode === "house"} onClick={() => setPickMode("house")}><HousePlus size={16} />Один дом</TabsTrigger>
      </TabsList>
      {pickMode === "area" ? <>
        <div className="territory-heading"><div><span className="eyebrow">БЫСТРОЕ НАЗНАЧЕНИЕ</span><h2>Три действия — и маршрут готов</h2></div><Badge variant={areaCorners.length === 2 ? "success" : "secondary"}>{areaCorners.length}/2 точки</Badge></div>
        <ol className="simple-steps">
          <li className={areaCorners.length === 2 ? "done" : ""}><b>1</b><span>Отметьте два угла<small>Нажмите на противоположные углы квартала</small></span></li>
          <li className={territoryAgitator ? "done" : ""}><b>2</b><span>Выберите агитатора<select className="input" value={territoryAgitator} onChange={(event) => setTerritoryAgitator(event.target.value)}><option value="">Кому назначить</option>{activeAgitators.map((agitator) => <option key={agitator.id} value={agitator.id}>{agitator.name}</option>)}</select></span></li>
          <li className={includedCandidates.length + selectedIds.length > 0 ? "done" : ""}><b>3</b><span>Подтвердите<small>{includedCandidates.length} новых + {selectedIds.length} существующих домов</small></span></li>
        </ol>
        {candidates.length > 0 && <div className="candidate-hint"><strong>Проверьте оранжевые точки</strong><span>Нажмите лишнюю точку на карте — она станет серой и не попадёт в маршрут.</span></div>}
        <Button size="lg" className="full-width" disabled={busy || !territoryAgitator || (!includedCandidates.length && !selectedIds.length)} onClick={finalizeTerritory}><MapPinned size={18} />{busy ? "Подготавливаем…" : "Назначить и построить маршрут"}</Button>
        <div className="territory-secondary-actions">
          {areaCorners.length === 2 && <Button variant="outline" disabled={busy} onClick={() => void discover(areaCorners)}><RotateCcw size={16} />{busy ? "Ищем…" : "Обновить дома"}</Button>}
          <Button variant="ghost" onClick={resetTerritory}>Сбросить</Button>
        </div>
      </> : <>
        <div className="territory-heading"><div><span className="eyebrow">ТОЧЕЧНОЕ ДОБАВЛЕНИЕ</span><h2>Найдите или укажите дом</h2></div></div>
        <form className="search-form" onSubmit={searchAddress}><input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Улица и номер дома" /><Button variant="outline" type="submit">{searching ? "…" : "Найти"}</Button></form>
        {searchResults.length > 0 && <div className="search-results">{searchResults.map((result, index) => <button key={`${result.lat}-${result.lon}-${index}`} onClick={() => chooseSearch(result)}><strong>{result.address}</strong><small>{result.label}</small></button>)}</div>}
        <form className="form-grid" onSubmit={addHouse}>
          <label className="label">Адрес<input className="input" required value={manualAddress} onChange={(event) => setManualAddress(event.target.value)} placeholder="ул. Мира, 12" /></label>
          <label className="label">Что сделать<input className="input" name="note" placeholder="Расклейка / листовки" /></label>
          <label className="label">Назначить<select className="input" name="agitatorId"><option value="">Пока никому</option>{activeAgitators.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          {coords ? <div className="picked-point">Точка выбрана на карте</div> : <div className="map-pick-callout">Нажмите место дома на карте</div>}
          <Button size="lg" className="full-width" type="submit" disabled={!coords}><HousePlus size={18} />Добавить дом</Button>
        </form>
      </>}
    </div>;
  }

  function renderRoutesPage() {
    if (!data) return null;
    const selectedAgitator = data.agitators.find((item) => item.id === routeAgitator);
    const selectedStat = data.stats.find((item) => item.agitatorId === routeAgitator);
    const editableRouteCount = routeAssignments.filter((item) => item.status === "TODO").length;
    const routePeople = data.agitators.filter((agitator) => agitator.active || (data.stats.find((item) => item.agitatorId === agitator.id)?.total || 0) > 0);
    return <section className="routes-page">
      <div className="workspace-card route-roster-card">
        <div className="section-heading"><div><span className="eyebrow">МАРШРУТЫ КОМАНДЫ</span><h2>Управление в один экран</h2></div><div className="route-roster-actions"><Badge variant="outline">{data.assignments.length} назначений</Badge><Button variant="destructive" size="sm" disabled={routeBusy || !data.stats.some((stat) => stat.todo > 0)} onClick={() => void clearAllRoutes()}><Trash2 size={15} />Очистить свободные</Button></div></div>
        <div className="route-roster">
          {routePeople.map((agitator) => {
            const stat = data.stats.find((item) => item.agitatorId === agitator.id);
            return <div className={`route-person-card ${routeAgitator === agitator.id ? "active" : ""}`} key={agitator.id}>
              <button className="route-person-main" type="button" onClick={() => { setRouteAgitator(agitator.id); setRouteTarget(""); }}>
                <span className="avatar-circle">{agitator.name.charAt(0).toUpperCase()}</span>
                <span className="route-person-copy"><strong>{agitator.name}</strong><small>{stat?.todo || 0} не начато · {stat?.active || 0} в работе</small></span>
                <span className="route-person-total"><strong>{stat?.total || 0}</strong><small>домов</small></span>
              </button>
              <Button variant="ghost" size="icon" className="route-quick-clear" disabled={routeBusy || !(stat?.todo || 0)} onClick={() => void clearRoute(agitator.id)} aria-label={`Очистить маршрут ${agitator.name}`} title="Снять все не начатые дома"><Trash2 size={17} /></Button>
            </div>;
          })}
        </div>
      </div>

      {!selectedAgitator ? <div className="workspace-card route-empty"><RouteIcon size={28} /><h2>Выберите агитатора</h2><p>Откроется карта маршрута, порядок домов, перенос и безопасная очистка.</p></div> : <div className="route-manager-layout">
        <div className="workspace-card route-map-card">
          <div className="section-heading"><div><span className="eyebrow">МАРШРУТ НА КАРТЕ</span><h2>{selectedAgitator.name}</h2></div><Badge variant={route.length ? "default" : "secondary"}>{route.length} в маршруте</Badge></div>
          {route.length ? <div className="admin-route-preview route-manager-map"><AdminMapClient points={route} selectedIds={[]} pickEnabled={false} onPick={() => undefined} onToggle={() => undefined} route={route} /></div> : <div className="route-map-empty"><RouteIcon size={26} /><strong>Активный маршрут пуст</strong><span>Назначьте дома ниже или на вкладке «Карта».</span></div>}
        </div>

        <aside className="workspace-card route-settings-card">
          <div className="route-settings-heading"><div><span className="eyebrow">НАСТРОЙКИ</span><h2>Маршрут</h2></div><Settings2 size={20} /></div>
          <div className="route-stat-grid"><span><b>{selectedStat?.todo || 0}</b><small>не начато</small></span><span><b>{selectedStat?.active || 0}</b><small>в работе</small></span><span><b>{selectedStat?.rejected || 0}</b><small>переделать</small></span><span><b>{selectedStat?.submitted || 0}</b><small>проверка</small></span><span><b>{selectedStat?.accepted || 0}</b><small>принято</small></span></div>

          <div className="route-setting-group">
            <label className="label">Порядок обхода<select className="input" value={routeStrategy} onChange={(event) => setRouteStrategy(event.target.value as RouteStrategy)}><option value="nearest">Короткий — соседние дома</option><option value="address">По адресу и номеру дома</option></select></label>
            <Button className="full-width" disabled={routeBusy || !route.length} onClick={() => void optimizeRoute(routeAgitator, routeStrategy)}>{routeStrategy === "address" ? <ArrowDownAZ size={17} /> : <RouteIcon size={17} />}Применить порядок</Button>
            <div className="route-button-grid"><Button variant="outline" disabled={routeBusy || !route.length} onClick={() => void optimizeRoute(routeAgitator, "nearest", true)}><LocateFixed size={17} />От моего места</Button><Button variant="outline" disabled={routeBusy || !route.length} onClick={() => void optimizeRoute(routeAgitator, "reverse")}><ArrowDownUp size={17} />Развернуть</Button></div>
          </div>

          <div className="route-setting-group">
            <label className="label">Перенести не начатые дома<select className="input" value={routeTarget} onChange={(event) => setRouteTarget(event.target.value)}><option value="">Выберите агитатора</option>{activeAgitators.filter((item) => item.id !== routeAgitator).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <Button variant="secondary" className="full-width" disabled={routeBusy || !routeTarget || !editableRouteCount} onClick={() => void transferRoute()}><ArrowRightLeft size={17} />Перенести {editableRouteCount || ""} домов</Button>
          </div>

          <div className="route-danger-zone"><div><strong>Быстрая очистка</strong><span>Снимет только «не начато». Отчёты, фото и история останутся.</span></div><Button variant="destructive" disabled={routeBusy || !editableRouteCount} onClick={() => void clearRoute(routeAgitator)}><Trash2 size={17} />Снять {editableRouteCount || ""}</Button></div>
        </aside>
      </div>}

      <div className="workspace-card house-manager-card">
        <div className="section-heading"><div><span className="eyebrow">ТОЧЕЧНОЕ УПРАВЛЕНИЕ</span><h2>Все дома</h2></div><input className="input compact-input" value={taskQuery} onChange={(event) => setTaskQuery(event.target.value)} placeholder="Найти адрес" /></div>
        <div className="bulk-bar route-bulk-bar"><span>Выбрано: <b>{selectedIds.length}</b></span><select className="input" value={bulkAgitator} onChange={(event) => setBulkAgitator(event.target.value)}><option value="">Кому назначить</option>{activeAgitators.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><Button disabled={!selectedIds.length || !bulkAgitator} onClick={() => void assignHouses(selectedIds, bulkAgitator, true)}><RouteIcon size={17} />Назначить</Button><Button variant="destructive" disabled={!selectedIds.length || routeBusy} onClick={() => void removeAssignments(selectedIds, `Снять назначения с ${selectedIds.length} выбранных домов? Задания с историей останутся.`)}><Trash2 size={17} />Снять</Button><Button variant="ghost" disabled={!filteredTasks.length} onClick={() => setSelectedIds(filteredTasks.map((house) => house.id))}>Выбрать найденные</Button><Button variant="ghost" disabled={!selectedIds.length} onClick={() => setSelectedIds([])}>Сбросить</Button></div>
        <div className="assignment-list">{filteredTasks.map((house) => {
          const assignment = assignmentByHouse.get(house.id);
          const locked = Boolean(assignment && assignment.status !== "TODO");
          return <div className={`assignment-row ${selectedIds.includes(house.id) ? "selected" : ""}`} key={house.id}>
            <input type="checkbox" checked={selectedIds.includes(house.id)} onChange={() => toggleSelected(house.id)} aria-label={`Выбрать ${house.address}`} />
            <div className="assignment-copy"><strong>{house.address}</strong><small>{assignment ? `${assignment.agitatorName} · ${statusText[assignment.status] || assignment.status}${assignment.routeOrder ? ` · №${assignment.routeOrder}` : ""}` : "Не назначено"}</small></div>
            <div className="assignment-actions"><select className="input assignment-select" value={assignment?.agitatorId || ""} disabled={locked} onChange={(event) => void assignOne(house.id, event.target.value)}><option value="">Без назначения</option>{activeAgitators.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{assignment?.status === "TODO" && <Button variant="ghost" size="icon" className="assignment-remove" disabled={routeBusy} onClick={() => void removeAssignments([house.id], `Снять назначение с дома «${house.address}»?`)} aria-label={`Снять назначение с ${house.address}`}><Trash2 size={17} /></Button>}</div>
          </div>;
        })}</div>
      </div>
    </section>;
  }

  const navItems = [
    { id: "territory" as const, label: "Карта", icon: MapIcon },
    { id: "tasks" as const, label: "Маршруты", icon: ClipboardList },
    { id: "team" as const, label: "Команда", icon: Users },
    { id: "reports" as const, label: "Отчёты", icon: Camera },
    { id: "history" as const, label: "История", icon: History },
  ];

  if (needsLogin) return <main className="shell"><div className="card admin-login"><div className="brand"><span className="brand-mark">A</span> AGIT / штаб</div><h2>Вход в штаб</h2><p className="muted">Управление территорией и отчётами</p><form className="form-grid" onSubmit={login}><label className="label">Пароль<input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus /></label><Button size="lg" className="full-width" type="submit">Войти</Button></form>{notice && <div className="notice notice-danger">{notice.text}</div>}</div></main>;
  if (!data && loadError) return <main className="shell"><div className="card admin-login"><h2>Штаб временно недоступен</h2><p>{loadError}</p><Button onClick={() => void load()}>Повторить</Button></div></main>;
  if (!data) return <main className="shell"><div className="loading-card">Загрузка штаба…</div></main>;

  return <main className="shell admin-shell">
    <header className="admin-header"><div><div className="brand"><span className="brand-mark">A</span><span>AGIT <i>/ штаб</i></span></div><p className="admin-subtitle">Территория, команда и отчёты на одной карте</p></div><div className="btn-row"><a className="btn btn-header" href="/"><MapIcon size={16} />Карта агитатора</a><Button variant="ghost" className="header-logout" onClick={logout}><LogOut size={16} />Выйти</Button></div></header>
    <section className="admin-summary"><div><span className="summary-icon summary-icon-orange"><MapPinned size={18} /></span><span><small>Принято домов</small><strong>{accepted}<em> / {data.assignments.length}</em></strong></span></div><div><span className="summary-icon"><Users size={18} /></span><span><small>В команде</small><strong>{activeAgitators.length}</strong></span></div><div className={pendingReports ? "summary-alert" : ""}><span className="summary-icon"><Camera size={18} /></span><span><small>Ждут решения</small><strong>{pendingReports}</strong></span></div></section>
    <TabsList className="admin-tabs" aria-label="Разделы штаба">{navItems.map(({ id, label, icon: Icon }) => <TabsTrigger key={id} active={tab === id} onClick={() => goTab(id)}><Icon size={18} /><span>{label}</span>{id === "reports" && pendingReports > 0 && <b>{pendingReports}</b>}</TabsTrigger>)}</TabsList>
    {notice && <div className={`notice ${notice.danger ? "notice-danger" : "notice-ok"} admin-notice`}>{notice.text}</div>}

    {tab === "overview" && <section className="dashboard-grid"><div className="workspace-card dashboard-hero"><span className="eyebrow">БЫСТРЫЙ СТАРТ</span><h1>Территория назначается одним действием</h1><p className="muted">Выделите квартал двумя точками, выберите агитатора и нажмите одну кнопку. Дома загрузятся, назначатся и выстроятся в маршрут.</p><button className="btn btn-primary btn-large" onClick={() => goTab("territory")}>Назначить территорию</button></div><div className="workspace-card"><span className="eyebrow">СЕЙЧАС</span><h2>{pendingReports ? `${pendingReports} отчётов ждут проверки` : "Новых отчётов нет"}</h2><button className="btn btn-ghost" onClick={() => goTab("reports")}>Открыть отчёты</button></div><div className="workspace-card dashboard-wide"><div className="section-heading"><div><span className="eyebrow">КОМАНДА</span><h2>Ход работы</h2></div></div><div className="team-progress-list">{data.agitators.map((agitator) => { const stat = data.stats.find((item) => item.agitatorId === agitator.id); return <div className="team-progress" key={agitator.id}><div><strong>{agitator.name}</strong><small>{stat?.accepted || 0} из {stat?.total || 0} принято</small></div><div className="mini-progress"><i style={{ width: `${stat?.completionRate || 0}%` }} /></div><b>{stat?.completionRate || 0}%</b></div>; })}</div></div></section>}

    {tab === "territory" && <section className="admin-map-layout">
      <div className="admin-map-main">
        <div className="map-toolbar">
          <div><span className="eyebrow">РАБОЧАЯ КАРТА</span><strong>{pickMode === "area" ? (areaCorners.length === 2 ? "Территория найдена — проверьте дома" : "Нажмите два противоположных угла квартала") : "Нажмите точку нового дома"}</strong></div>
          <div className="map-toolbar-actions"><Badge variant="outline">{data.houses.length} домов</Badge><Button className="mobile-panel-button" size="sm" onClick={() => setMobilePanelOpen(true)}><Menu size={16} />Действия</Button></div>
        </div>
        <div className="admin-map-wrap"><AdminMapClient points={mapPoints} candidates={candidates} excludedCandidateIds={excludedCandidateIds} selectedIds={selectedIds} selectedPoint={coords} areaCorners={areaCorners} pickEnabled={!busy} onPick={mapPick} onToggle={toggleSelected} onToggleCandidate={toggleCandidate} focusPoint={focusPoint} route={route} /></div>
        <div className="map-bottom-status"><span><i className="legend-dot legend-new" />Новые из OSM</span><span><i className="legend-dot legend-selected" />Выбраны</span><span><i className="legend-dot legend-done" />Приняты</span></div>
      </div>
      <aside className="admin-side-card desktop-territory-panel">{renderTerritoryControls()}</aside>
      <div className="mobile-territory-dock"><Button size="lg" className="full-width" onClick={() => setMobilePanelOpen(true)}><Menu size={18} />{areaCorners.length === 2 ? `Продолжить · ${includedCandidates.length + selectedIds.length} домов` : "Назначить территорию"}</Button></div>
      <Sheet open={mobilePanelOpen} onOpenChange={setMobilePanelOpen}><SheetContent side="bottom" className="territory-sheet"><SheetHeader><SheetTitle>Работа с картой</SheetTitle><SheetDescription>Выделите дома и назначьте их агитатору</SheetDescription></SheetHeader>{renderTerritoryControls()}</SheetContent></Sheet>
    </section>}

    {tab === "tasks" && renderRoutesPage()}

    {tab === "team" && <section className="admin-two-column"><div><div className="workspace-card"><span className="eyebrow">КОМАНДА</span><h2>Добавить агитатора</h2><form className="form-grid" onSubmit={addAgitator}><label className="label">Имя<input className="input" name="name" required /></label><label className="label">VK ID<input className="input" name="vkId" inputMode="numeric" required /></label><button className="btn btn-primary">Добавить</button></form></div><div className="workspace-card"><span className="eyebrow">УВЕДОМЛЕНИЯ ШТАБА</span><h2>Получать новые отчёты в VK</h2><form className="form-grid" onSubmit={addRecipient}><label className="label">Имя<input className="input" name="name" required /></label><label className="label">Ваш VK ID<input className="input" name="vkId" inputMode="numeric" required /></label><button className="btn btn-primary">Включить и отправить тест</button></form><div className="recipient-list">{data.notificationRecipients.filter((item) => item.active).map((item) => <small key={item.id}>✓ {item.name} · VK {item.vkId}</small>)}</div></div></div><div className="workspace-card"><div className="section-heading"><div><span className="eyebrow">РЕЗУЛЬТАТЫ</span><h2>Агитаторы</h2></div></div><div className="people-list">{data.agitators.map((agitator) => { const stat = data.stats.find((item) => item.agitatorId === agitator.id); return <div className="person-stat" key={agitator.id}><div className="avatar-circle">{agitator.name.charAt(0).toUpperCase()}</div><div><strong>{agitator.name}</strong><small>VK {agitator.vkId} · {stat?.accepted || 0}/{stat?.total || 0} принято · {stat?.completionRate || 0}%</small>{stat?.averageDistance != null && <small>Средняя точность: {stat.averageDistance} м</small>}</div><button className={`btn ${agitator.active ? "btn-ghost" : "btn-ok"}`} onClick={() => toggleAgitator(agitator.id, !agitator.active)}>{agitator.active ? "Пауза" : "Включить"}</button></div>; })}</div></div></section>}

    {tab === "reports" && <section className="workspace-card"><div className="reports-toolbar"><div><span className="eyebrow">ФОТООТЧЁТЫ</span><h2>Проверка работ</h2></div><div className="btn-row"><a className="btn btn-primary" href="/api/admin/export">Скачать ZIP</a><button className="btn btn-ghost" onClick={confirmExport}>Подтвердить выгрузку</button><button className="btn btn-danger" onClick={deleteExported}>Удалить выгруженные</button></div></div><div className="filter-bar"><input className="input" value={reportQuery} onChange={(event) => setReportQuery(event.target.value)} placeholder="Адрес или агитатор" /><select className="input" value={reportFilter} onChange={(event) => setReportFilter(event.target.value)}><option value="SUBMITTED">Ждут проверки</option><option value="all">Все</option><option value="ACCEPTED">Принятые</option><option value="REJECTED">Переделать</option></select></div>{!filteredReports.length ? <div className="empty-state compact"><h3>Здесь пока пусто</h3></div> : <div className="report-grid">{filteredReports.map((report) => <article className={`report-card ${report.id === highlightReportId ? "highlight" : ""}`} key={report.id}><div className="report-card-head"><div><strong>{report.address}</strong><small>{report.agitatorName} · {report.distanceMeters} м · {new Date(report.createdAt).toLocaleString("ru-RU")}</small></div><span className={`status-pill status-${report.status.toLowerCase()}`}>{statusText[report.status]}</span></div><div className="report-photos">{report.photos.map((photo) => <a key={photo.id} href={`/api/admin/photos/${photo.id}`} target="_blank" rel="noreferrer"><img className="report-photo" src={`/api/admin/photos/${photo.id}`} alt="Фотоотчёт" /></a>)}</div>{report.reviewComment && <div className="notice notice-danger">Комментарий: {report.reviewComment}</div>}{report.status === "SUBMITTED" && <div className="report-actions">{rejectingId === report.id ? <div className="reject-box"><div className="quick-reasons">{["Нужен общий план дома","Фото нечёткое","Не видно выполненную работу","Неверный дом"].map((reason) => <button key={reason} onClick={() => setRejectComment(reason)}>{reason}</button>)}</div><textarea className="input" value={rejectComment} onChange={(event) => setRejectComment(event.target.value)} placeholder="Что нужно исправить" /><div className="btn-row"><button className="btn btn-danger" disabled={!rejectComment.trim()} onClick={() => reportAction(report.id, "reject", rejectComment)}>Отправить на переделку</button><button className="btn btn-ghost" onClick={() => setRejectingId(undefined)}>Отмена</button></div></div> : <div className="btn-row"><button className="btn btn-ok" onClick={() => reportAction(report.id, "accept")}>Принять</button><button className="btn btn-danger" onClick={() => setRejectingId(report.id)}>Переделать</button></div>}</div>}{report.exportedAt && <span className="status-pill status-accepted">Выгружено</span>}</article>)}</div>}</section>}

    {tab === "history" && <section className="workspace-card"><div className="section-heading"><div><span className="eyebrow">ЖУРНАЛ</span><h2>История действий</h2></div><span className="muted">последние {data.activities.length}</span></div><div className="activity-list">{data.activities.map((activity) => <div className="activity-row" key={activity.id}><span className="activity-dot" /><div><strong>{activity.message}</strong><small>{activity.actorName} · {new Date(activity.createdAt).toLocaleString("ru-RU")}</small></div></div>)}</div></section>}
  </main>;
}
