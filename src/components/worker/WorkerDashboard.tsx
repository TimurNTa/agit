"use client";

import { useEffect, useMemo, useState } from "react";
import { MapClient } from "@/components/map/MapClient";
import type { MapTask } from "@/components/map/types";

type WorkerData = { worker: { name: string; vkId: string }; tasks: MapTask[] };

export function WorkerDashboard() {
  const [data, setData] = useState<WorkerData | null>(null);
  const [selectedId, setSelectedId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string>();
  const [unauthorized, setUnauthorized] = useState(false);

  async function load() {
    setLoading(true);
    const response = await fetch("/api/worker/tasks", { cache: "no-store" });
    if (response.status === 401) {
      setUnauthorized(true);
      setLoading(false);
      return;
    }
    const next = await response.json();
    setData(next);
    setUnauthorized(false);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const selected = data?.tasks.find((task) => task.id === selectedId);
  const stats = useMemo(() => {
    const tasks = data?.tasks || [];
    return {
      all: tasks.length,
      done: tasks.filter((t) => t.status === "ACCEPTED" || t.status === "SUBMITTED").length,
      left: tasks.filter((t) => t.status === "TODO" || t.status === "ACTIVE" || t.status === "REJECTED").length,
    };
  }, [data]);

  async function startReport() {
    if (!selected) return;
    setMessage("Определяем геопозицию…");
    if (!navigator.geolocation) {
      setMessage("На устройстве недоступна геопозиция.");
      return;
    }
    navigator.geolocation.getCurrentPosition(async (position) => {
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
        if (result.error === "too_far") setMessage(`Вы сейчас примерно в ${result.distance} м от дома. Нужно быть не дальше ${result.limit} м.`);
        else setMessage("Не получилось начать отчёт. Обновите страницу и попробуйте ещё раз.");
        return;
      }
      setMessage(`Геопозиция принята: ${result.distance} м от дома. Теперь отправьте 1–5 фотографий в сообщения сообщества VK.`);
      window.setTimeout(() => window.open(result.vkMessagesUrl, "_blank", "noopener,noreferrer"), 450);
      await load();
    }, () => setMessage("Не удалось получить геопозицию. Разрешите доступ к местоположению и повторите."), {
      enableHighAccuracy: true,
      timeout: 12_000,
      maximumAge: 10_000,
    });
  }

  if (loading) return <main className="shell"><div className="card">Загрузка карты…</div></main>;

  if (unauthorized) {
    return (
      <main className="shell">
        <div className="topbar"><div className="brand"><span className="brand-mark">A</span> AGIT</div></div>
        <div className="card">
          <h2>Вход через VK-бота</h2>
          <p className="muted">Напишите сообщение сообществу «Агитаторы». Бот пришлёт персональную ссылку на карту, действующую 15 минут.</p>
          <p className="muted">Если бот пишет, что вы не добавлены, передайте руководителю свой VK ID.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <div className="topbar">
        <div className="brand"><span className="brand-mark">A</span> AGIT</div>
        <div className="muted">{data?.worker.name}</div>
      </div>
      <div className="stats">
        <div className="stat"><span className="muted">Всего</span><strong>{stats.all}</strong></div>
        <div className="stat"><span className="muted">Отправлено</span><strong>{stats.done}</strong></div>
        <div className="stat"><span className="muted">Осталось</span><strong>{stats.left}</strong></div>
      </div>
      <div className="map-wrap">
        <MapClient tasks={data?.tasks || []} selectedId={selectedId} onSelect={setSelectedId} />
      </div>
      <div className="card task-panel">
        {selected ? (
          <>
            <div className="task-title">{selected.address}</div>
            <div className="muted">{selected.note || "Фотоотчёт по этой точке"}</div>
            <div className="divider" />
            <button className="btn btn-primary" onClick={startReport} disabled={selected.status === "ACCEPTED" || selected.status === "SUBMITTED"}>
              {selected.status === "ACCEPTED" ? "Отчёт принят" : selected.status === "SUBMITTED" ? "Уже отправлено на проверку" : "Сделал — отправить фото"}
            </button>
          </>
        ) : <div className="muted">Нажмите на точку дома на карте.</div>}
        {message && <div className="notice" style={{ marginTop: 10 }}>{message}</div>}
      </div>
    </main>
  );
}
