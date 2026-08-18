"use client";

import { useEffect, useMemo, useState } from "react";
import { MapClient } from "@/components/map/MapClient";
import type { MapTask } from "@/components/map/types";

type WorkerData = { worker: { name: string; vkId: string }; tasks: MapTask[] };
type Location = { lat: number; lon: number };

const statusLabel: Record<MapTask["status"], string> = { TODO: "Не начато", ACTIVE: "В работе", SUBMITTED: "На проверке", ACCEPTED: "Принято", REJECTED: "Переделать" };

export function WorkerDashboard() {
  const [data, setData] = useState<WorkerData | null>(null);
  const [selectedId, setSelectedId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [unauthorized, setUnauthorized] = useState(false);
  const [userLocation, setUserLocation] = useState<Location>();
  const [locating, setLocating] = useState(false);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    setLoadError(undefined);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch("/api/worker/tasks", { cache: "no-store", signal: controller.signal });
      if (response.status === 401) { setUnauthorized(true); setData(null); return; }
      if (!response.ok) throw new Error(`worker_tasks_${response.status}`);
      const next: WorkerData = await response.json();
      setData(next); setUnauthorized(false);
      setSelectedId((current) => current && next.tasks.some((task) => task.id === current) ? current : next.tasks.find((task) => task.status !== "ACCEPTED" && task.status !== "SUBMITTED")?.id || next.tasks[0]?.id);
    } catch (error) {
      console.error("Worker tasks load failed", error);
      setLoadError("Не удалось загрузить задания. Проверьте интернет и повторите.");
    } finally { window.clearTimeout(timeout); if (!silent) setLoading(false); }
  }

  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState === "visible") void load(true); };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);

  const selected = data?.tasks.find((task) => task.id === selectedId);
  const nextTask = data?.tasks.find((task) => task.status !== "ACCEPTED" && task.status !== "SUBMITTED");
  const stats = useMemo(() => {
    const tasks = data?.tasks || [];
    return { all: tasks.length, accepted: tasks.filter((task) => task.status === "ACCEPTED").length, submitted: tasks.filter((task) => task.status === "SUBMITTED").length, left: tasks.filter((task) => task.status !== "ACCEPTED" && task.status !== "SUBMITTED").length };
  }, [data]);
  const progress = stats.all ? Math.round(stats.accepted / stats.all * 100) : 0;

  function getPosition() {
    return new Promise<GeolocationPosition>((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("geolocation_unavailable"));
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 12_000, maximumAge: 10_000 });
    });
  }

  async function locateAndOrder() {
    setLocating(true); setMessage("Определяем ваше местоположение…");
    try {
      const position = await getPosition();
      const location = { lat: position.coords.latitude, lon: position.coords.longitude };
      setUserLocation(location);
      const response = await fetch("/api/worker/route", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(location) });
      if (!response.ok) throw new Error("route_failed");
      setMessage("Маршрут перестроен от вашего текущего положения.");
      await load(true);
    } catch { setMessage("Не удалось определить местоположение. Разрешите геолокацию и повторите."); }
    finally { setLocating(false); }
  }

  async function startReport(task = selected) {
    if (!task) return;
    setMessage("Проверяем, что вы рядом с домом…");
    try {
      const position = await getPosition();
      setUserLocation({ lat: position.coords.latitude, lon: position.coords.longitude });
      const response = await fetch("/api/worker/reports/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assignmentId: task.id, lat: position.coords.latitude, lon: position.coords.longitude, accuracy: position.coords.accuracy }) });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error === "too_far" ? `До точки примерно ${result.distance} м. Подойдите ближе — максимум ${result.limit} м.` : "Не получилось начать отчёт. Обновите страницу и попробуйте ещё раз.");
        return;
      }
      setMessage(`Точка подтверждена: ${result.distance} м. Открываем VK — отправьте 1–5 фотографий этого дома.`);
      window.setTimeout(() => { window.location.href = result.vkMessagesUrl; }, 400);
    } catch { setMessage("Не удалось получить геопозицию. Разрешите доступ к местоположению и повторите."); }
  }

  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); window.location.reload(); }
  function navUrl(task: MapTask) { return `https://yandex.ru/maps/?rtext=${userLocation ? `${userLocation.lat},${userLocation.lon}` : ""}~${task.lat},${task.lon}&rtt=auto`; }

  if (loading) return <main className="shell worker-shell"><div className="loading-card">Загружаем задания…</div></main>;
  if (unauthorized) return <main className="shell worker-shell"><div className="worker-header"><div className="brand"><span className="brand-mark">A</span><span>AGIT</span></div></div><div className="empty-state auth-state"><div className="empty-icon">↗</div><h2>Вход через сообщения VK</h2><p>Напишите сообществу «Агитаторы». Бот пришлёт персональную ссылку на карту.</p><p className="muted">Ссылка одноразовая и действует 15 минут.</p></div></main>;
  if (!data && loadError) return <main className="shell worker-shell"><div className="empty-state auth-state"><h2>Задания временно недоступны</h2><p>{loadError}</p><button className="btn btn-primary btn-large" onClick={() => void load()}>Повторить</button></div></main>;
  if (!data) return null;

  return <main className="shell worker-shell">
    <header className="worker-header"><div className="brand"><span className="brand-mark">A</span><span>AGIT</span></div><div className="worker-identity"><span>{data.worker.name}</span><button className="link-button" onClick={logout}>Выйти</button></div></header>
    <section className="progress-card"><div className="progress-copy"><div><span className="eyebrow">МОЯ ТЕРРИТОРИЯ</span><strong>{stats.left} домов осталось</strong></div><span className="progress-percent">{progress}%</span></div><div className="progress-track"><div className="progress-fill" style={{ width: `${progress}%` }} /></div><div className="progress-meta"><span>Принято: {stats.accepted}</span><span>Проверка: {stats.submitted}</span><span>Всего: {stats.all}</span></div></section>
    {loadError && <div className="notice notice-danger">{loadError}</div>}
    {!stats.all ? <section className="empty-state worker-empty"><div className="empty-icon">✓</div><h2>Заданий пока нет</h2><p>Когда штаб назначит дома, они появятся здесь.</p></section> : <>
      {nextTask && <section className="next-task-card"><div><span className="eyebrow">СЕЙЧАС</span><h1>{nextTask.address}</h1>{nextTask.note && <p>{nextTask.note}</p>}{nextTask.rejectionReason && <div className="notice notice-danger">Переделать: {nextTask.rejectionReason}</div>}</div><div className="next-actions"><button className="btn btn-primary btn-large" onClick={() => { setSelectedId(nextTask.id); void startReport(nextTask); }}>Я на месте — сдать фото</button><a className="btn btn-ghost" href={navUrl(nextTask)} target="_blank" rel="noreferrer">Маршрут в Яндекс Картах</a></div></section>}
      {message && <div className="notice worker-message">{message}</div>}
      <section className="worker-map-card"><div className="map-toolbar"><div><strong>Маршрут обхода</strong><span className="muted"> · номера показывают порядок</span></div><button className="map-locate-btn" type="button" onClick={locateAndOrder}>{locating ? "Ищем…" : "◎ От меня"}</button></div><div className="worker-map-wrap"><MapClient tasks={data.tasks} selectedId={selectedId} onSelect={setSelectedId} userLocation={userLocation} /></div><div className="map-legend"><span><i className="dot dot-todo" />Не начато</span><span><i className="dot dot-review" />Проверка</span><span><i className="dot dot-done" />Принято</span></div></section>
      {selected && selected.id !== nextTask?.id && <section className="selected-task-card"><div className="selected-task-top"><div><span className="eyebrow">ВЫБРАННЫЙ ДОМ</span><h2>{selected.address}</h2></div><span className={`status-pill status-${selected.status.toLowerCase()}`}>{statusLabel[selected.status]}</span></div>{selected.note && <p className="task-note">{selected.note}</p>}{selected.rejectionReason && <div className="notice notice-danger">Причина: {selected.rejectionReason}</div>}<div className="btn-row"><button className="btn btn-primary btn-large" onClick={() => void startReport()} disabled={selected.status === "ACCEPTED" || selected.status === "SUBMITTED"}>{selected.status === "ACCEPTED" ? "✓ Принято" : selected.status === "SUBMITTED" ? "⌛ На проверке" : "Я на месте — сдать фото"}</button><a className="btn btn-ghost" href={navUrl(selected)} target="_blank" rel="noreferrer">Навигация</a></div></section>}
      <section className="task-list-section"><div className="section-heading"><div><span className="eyebrow">ВЕСЬ МАРШРУТ</span><h2>Мои дома</h2></div><span className="muted">{stats.all}</span></div><div className="task-list">{data.tasks.map((task, index) => <button key={task.id} type="button" className={`task-row ${task.id === selectedId ? "task-row-active" : ""}`} onClick={() => setSelectedId(task.id)}><span className="task-number">{task.routeOrder || index + 1}</span><span className="task-row-copy"><strong>{task.address}</strong><small>{task.rejectionReason ? `Переделать: ${task.rejectionReason}` : task.note || "Фотоотчёт"}</small></span><span className={`status-dot status-dot-${task.status.toLowerCase()}`} title={statusLabel[task.status]} /></button>)}</div></section>
    </>}
  </main>;
}
