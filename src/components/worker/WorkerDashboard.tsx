"use client";

import { useEffect, useMemo, useState } from "react";
import { MapClient } from "@/components/map/MapClient";
import type { MapTask } from "@/components/map/types";

type WorkerData = { worker: { name: string; vkId: string }; tasks: MapTask[] };
type Location = { lat: number; lon: number };

const statusLabel: Record<MapTask["status"], string> = {
  TODO: "Не начато",
  ACTIVE: "В работе",
  SUBMITTED: "На проверке",
  ACCEPTED: "Принято",
  REJECTED: "Переделать",
};

export function WorkerDashboard() {
  const [data, setData] = useState<WorkerData | null>(null);
  const [selectedId, setSelectedId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string>();
  const [unauthorized, setUnauthorized] = useState(false);
  const [userLocation, setUserLocation] = useState<Location>();
  const [locating, setLocating] = useState(false);

  async function load() {
    setLoading(true);
    const response = await fetch("/api/worker/tasks", { cache: "no-store" });
    if (response.status === 401) {
      setUnauthorized(true);
      setLoading(false);
      return;
    }
    const next: WorkerData = await response.json();
    setData(next);
    setUnauthorized(false);
    setSelectedId((current) => {
      if (current && next.tasks.some((task) => task.id === current)) return current;
      return next.tasks.find((task) => task.status !== "ACCEPTED")?.id || next.tasks[0]?.id;
    });
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const selected = data?.tasks.find((task) => task.id === selectedId);
  const stats = useMemo(() => {
    const tasks = data?.tasks || [];
    const accepted = tasks.filter((task) => task.status === "ACCEPTED").length;
    const submitted = tasks.filter((task) => task.status === "SUBMITTED").length;
    return { all: tasks.length, accepted, submitted, left: tasks.length - accepted };
  }, [data]);
  const progress = stats.all ? Math.round((stats.accepted / stats.all) * 100) : 0;

  function locate() {
    if (!navigator.geolocation) {
      setMessage("На устройстве недоступна геопозиция.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition((position) => {
      setUserLocation({ lat: position.coords.latitude, lon: position.coords.longitude });
      setLocating(false);
    }, () => {
      setLocating(false);
      setMessage("Не удалось определить местоположение. Проверьте разрешение геолокации.");
    }, { enableHighAccuracy: true, timeout: 12_000, maximumAge: 10_000 });
  }

  async function startReport() {
    if (!selected) return;
    setMessage("Проверяем, что вы находитесь рядом с домом…");
    if (!navigator.geolocation) {
      setMessage("На устройстве недоступна геопозиция.");
      return;
    }
    navigator.geolocation.getCurrentPosition(async (position) => {
      setUserLocation({ lat: position.coords.latitude, lon: position.coords.longitude });
      const response = await fetch("/api/worker/reports/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          assignmentId: selected.id,
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.error === "too_far") setMessage(`До точки примерно ${result.distance} м. Для отчёта подойдите ближе — максимум ${result.limit} м.`);
        else setMessage("Не получилось начать отчёт. Обновите страницу и попробуйте ещё раз.");
        return;
      }
      setMessage(`Точка подтверждена: ${result.distance} м от дома. Сейчас откроются сообщения VK — отправьте туда 1–5 фото этого дома.`);
      window.setTimeout(() => window.open(result.vkMessagesUrl, "_blank", "noopener,noreferrer"), 350);
      await load();
    }, () => setMessage("Не удалось получить геопозицию. Разрешите доступ к местоположению и повторите."), {
      enableHighAccuracy: true,
      timeout: 12_000,
      maximumAge: 10_000,
    });
  }

  if (loading) return <main className="shell worker-shell"><div className="loading-card">Загружаем задания…</div></main>;

  if (unauthorized) {
    return (
      <main className="shell worker-shell">
        <div className="worker-header"><div className="brand"><span className="brand-mark">A</span><span>AGIT</span></div></div>
        <div className="empty-state auth-state">
          <div className="empty-icon">↗</div>
          <h2>Вход через сообщения VK</h2>
          <p>Напишите сообществу «Агитаторы». Бот пришлёт персональную ссылку на вашу карту заданий.</p>
          <p className="muted">Ссылка одноразовая и действует 15 минут.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="shell worker-shell">
      <header className="worker-header">
        <div className="brand"><span className="brand-mark">A</span><span>AGIT</span></div>
        <div className="worker-name">{data?.worker.name}</div>
      </header>

      <section className="progress-card">
        <div className="progress-copy">
          <div><span className="eyebrow">МОЯ ТЕРРИТОРИЯ</span><strong>{stats.left} {stats.left === 1 ? "дом остался" : "домов осталось"}</strong></div>
          <span className="progress-percent">{progress}%</span>
        </div>
        <div className="progress-track"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
        <div className="progress-meta"><span>Принято: {stats.accepted}</span><span>На проверке: {stats.submitted}</span><span>Всего: {stats.all}</span></div>
      </section>

      {stats.all === 0 ? (
        <section className="empty-state worker-empty">
          <div className="empty-icon">✓</div>
          <h2>Заданий пока нет</h2>
          <p>Когда штаб назначит вам дома, они появятся здесь на карте и в списке.</p>
        </section>
      ) : (
        <>
          <section className="worker-map-card">
            <div className="map-toolbar">
              <div><strong>Карта заданий</strong><span className="muted"> Нажмите на дом</span></div>
              <button className="map-locate-btn" type="button" onClick={locate}>{locating ? "Ищем…" : "◎ Где я"}</button>
            </div>
            <div className="worker-map-wrap">
              <MapClient tasks={data?.tasks || []} selectedId={selectedId} onSelect={setSelectedId} userLocation={userLocation} />
            </div>
            <div className="map-legend"><span><i className="dot dot-todo" />Не начато</span><span><i className="dot dot-review" />Проверка</span><span><i className="dot dot-done" />Принято</span></div>
          </section>

          {selected && (
            <section className="selected-task-card">
              <div className="selected-task-top">
                <div><span className="eyebrow">ВЫБРАННЫЙ ДОМ</span><h2>{selected.address}</h2></div>
                <span className={`status-pill status-${selected.status.toLowerCase()}`}>{statusLabel[selected.status]}</span>
              </div>
              {selected.note && <p className="task-note">{selected.note}</p>}
              <button className="btn btn-primary btn-large" onClick={startReport} disabled={selected.status === "ACCEPTED" || selected.status === "SUBMITTED"}>
                {selected.status === "ACCEPTED" ? "✓ Отчёт принят" : selected.status === "SUBMITTED" ? "⌛ Отчёт на проверке" : selected.status === "REJECTED" ? "Переделать фотоотчёт" : "Сделал — сдать фотоотчёт"}
              </button>
              {message && <div className="notice" style={{ marginTop: 10 }}>{message}</div>}
            </section>
          )}

          <section className="task-list-section">
            <div className="section-heading"><div><span className="eyebrow">ЗАДАНИЯ</span><h2>Мои дома</h2></div><span className="muted">{stats.all}</span></div>
            <div className="task-list">
              {data?.tasks.map((task, index) => (
                <button key={task.id} type="button" className={`task-row ${task.id === selectedId ? "task-row-active" : ""}`} onClick={() => setSelectedId(task.id)}>
                  <span className="task-number">{index + 1}</span>
                  <span className="task-row-copy"><strong>{task.address}</strong><small>{task.note || "Фотоотчёт"}</small></span>
                  <span className={`status-dot status-dot-${task.status.toLowerCase()}`} title={statusLabel[task.status]} />
                </button>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
