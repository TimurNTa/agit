"use client";

import { FormEvent, useMemo, useState, useEffect } from "react";
import { AdminMapClient } from "@/components/admin/AdminMapClient";

type Tab = "map" | "tasks" | "agitators" | "reports";
type Data = {
  agitators: Array<{ id: string; name: string; vkId: string; active: boolean }>;
  houses: Array<{ id: string; address: string; lat: number; lon: number }>;
  assignments: Array<{ id: string; status: string; agitatorId: string; agitatorName: string; houseId: string; address: string }>;
  reports: Array<{ id: string; status: string; agitatorName: string; address: string; distanceMeters: number; createdAt: string; exportedAt?: string | null; photos: Array<{ id: string }> }>;
};

const statusText: Record<string, string> = {
  TODO: "Не начато",
  ACTIVE: "В работе",
  SUBMITTED: "На проверке",
  ACCEPTED: "Принято",
  REJECTED: "Переделать",
};

export function AdminDashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<string>();
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [tab, setTab] = useState<Tab>("map");

  async function load() {
    const response = await fetch("/api/admin/data", { cache: "no-store" });
    if (response.status === 401) { setNeedsLogin(true); return; }
    setData(await response.json());
    setNeedsLogin(false);
  }

  useEffect(() => { void load(); }, []);

  const assignmentByHouse = useMemo(() => new Map((data?.assignments || []).map((item) => [item.houseId, item])), [data]);
  const pendingReports = data?.reports.filter((report) => report.status === "SUBMITTED").length || 0;
  const accepted = data?.assignments.filter((item) => item.status === "ACCEPTED").length || 0;
  const totalAssignments = data?.assignments.length || 0;

  async function login(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
    if (!response.ok) { setNotice("Неверный пароль"); return; }
    setPassword(""); setNotice(undefined); await load();
  }

  async function addAgitator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const response = await fetch("/api/admin/agitators", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.get("name"), vkId: form.get("vkId") }) });
    setNotice(response.ok ? "Агитатор добавлен" : "Не удалось добавить агитатора");
    if (response.ok) { formEl.reset(); await load(); }
  }

  async function addHouse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!coords) { setNotice("Сначала нажмите на нужный дом на карте"); return; }
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const response = await fetch("/api/admin/houses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: form.get("address"), note: form.get("note"), agitatorId: form.get("agitatorId"), lat: coords.lat, lon: coords.lon }) });
    setNotice(response.ok ? "Дом добавлен" : "Не удалось добавить дом");
    if (response.ok) { formEl.reset(); setCoords(null); await load(); }
  }

  async function assignHouse(houseId: string, agitatorId: string) {
    const response = await fetch("/api/admin/assignments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ houseId, agitatorId }) });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setNotice(body.error === "assignment_locked" ? "Нельзя переназначить дом: отчёт уже отправлен или принят" : "Не удалось изменить назначение");
      return;
    }
    setNotice(agitatorId ? "Назначение сохранено" : "Дом снят с назначения");
    await load();
  }

  async function reportAction(id: string, action: "accept" | "reject") {
    await fetch(`/api/admin/reports/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
    await load();
  }

  async function confirmExport() {
    const response = await fetch("/api/admin/export/confirm", { method: "POST" });
    const result = await response.json();
    setNotice(`Отмечено выгруженными отчётов: ${result.marked || 0}`);
    await load();
  }

  async function deleteExported() {
    if (!confirm("Удалить с сервера фотографии всех отчётов, которые отмечены выгруженными? Восстановить их через систему будет нельзя.")) return;
    const response = await fetch("/api/admin/photos/delete-exported", { method: "POST" });
    const result = await response.json();
    setNotice(`Удалено файлов: ${result.deleted || 0}`);
    await load();
  }

  if (needsLogin) {
    return <main className="shell"><div className="card admin-login"><div className="brand"><span className="brand-mark">A</span> AGIT / штаб</div><h2>Вход в штаб</h2><form className="form-grid" onSubmit={login}><label className="label">Пароль<input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus /></label><button className="btn btn-primary btn-large">Войти</button></form>{notice && <div className="notice notice-danger" style={{ marginTop: 10 }}>{notice}</div>}</div></main>;
  }

  if (!data) return <main className="shell"><div className="loading-card">Загрузка штаба…</div></main>;

  return (
    <main className="shell admin-shell">
      <header className="admin-header">
        <div><div className="brand"><span className="brand-mark">A</span><span>AGIT / штаб</span></div><p className="muted admin-subtitle">Управление полевой работой</p></div>
        <a className="btn btn-ghost" href="/">Карта агитатора</a>
      </header>

      <section className="admin-summary">
        <div><span className="eyebrow">ЗАДАНИЯ</span><strong>{accepted}/{totalAssignments}</strong><small>принято</small></div>
        <div><span className="eyebrow">АГИТАТОРЫ</span><strong>{data.agitators.length}</strong><small>активных</small></div>
        <div><span className="eyebrow">НА ПРОВЕРКЕ</span><strong>{pendingReports}</strong><small>отчётов</small></div>
      </section>

      <nav className="admin-tabs" aria-label="Разделы штаба">
        <button className={tab === "map" ? "active" : ""} onClick={() => setTab("map")}>Карта</button>
        <button className={tab === "tasks" ? "active" : ""} onClick={() => setTab("tasks")}>Задания <span>{data.houses.length}</span></button>
        <button className={tab === "agitators" ? "active" : ""} onClick={() => setTab("agitators")}>Агитаторы <span>{data.agitators.length}</span></button>
        <button className={tab === "reports" ? "active" : ""} onClick={() => setTab("reports")}>Отчёты {pendingReports > 0 && <b>{pendingReports}</b>}</button>
      </nav>

      {notice && <div className="notice notice-ok admin-notice">{notice}</div>}

      {tab === "map" && (
        <section className="admin-map-layout">
          <div className="admin-map-main">
            <div className="map-toolbar"><div><strong>Карта домов</strong><span className="muted"> · нажмите место, чтобы добавить точку</span></div><span className="map-count">{data.houses.length}</span></div>
            <div className="admin-map-wrap"><AdminMapClient points={data.houses} selectedPoint={coords} onPick={(lat, lon) => setCoords({ lat, lon })} /></div>
          </div>
          <aside className="admin-side-card">
            <span className="eyebrow">НОВАЯ ТОЧКА</span>
            <h2>{coords ? "Дом выбран" : "Нажмите на дом на карте"}</h2>
            <p className="muted">Координаты заполняются автоматически и больше не нужно вводить их вручную.</p>
            <form className="form-grid" onSubmit={addHouse}>
              <label className="label">Адрес<input className="input" name="address" required disabled={!coords} placeholder="Например: ул. Мира, 12" /></label>
              <label className="label">Что сделать<input className="input" name="note" disabled={!coords} placeholder="Листовки / расклейка / другое" /></label>
              <label className="label">Назначить<select className="input" name="agitatorId" disabled={!coords}><option value="">Пока никому</option>{data.agitators.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
              {coords && <div className="picked-point">✓ Точка выбрана на карте</div>}
              <button className="btn btn-primary btn-large" disabled={!coords}>Добавить дом</button>
              {coords && <button className="btn btn-ghost" type="button" onClick={() => setCoords(null)}>Отменить выбор</button>}
            </form>
          </aside>
        </section>
      )}

      {tab === "tasks" && (
        <section className="workspace-card">
          <div className="section-heading"><div><span className="eyebrow">РАСПРЕДЕЛЕНИЕ</span><h2>Дома и исполнители</h2></div><span className="muted">{data.houses.length} точек</span></div>
          {data.houses.length === 0 ? <div className="empty-state compact"><h3>Домов пока нет</h3><p>Добавьте первую точку во вкладке «Карта».</p></div> : (
            <div className="assignment-list">
              {data.houses.map((house) => {
                const assignment = assignmentByHouse.get(house.id);
                const locked = assignment?.status === "SUBMITTED" || assignment?.status === "ACCEPTED";
                return <div className="assignment-row" key={house.id}><div className="assignment-copy"><strong>{house.address}</strong><small>{assignment ? statusText[assignment.status] || assignment.status : "Не назначено"}</small></div><select className="input assignment-select" value={assignment?.agitatorId || ""} disabled={locked} onChange={(e) => void assignHouse(house.id, e.target.value)}><option value="">Без назначения</option>{data.agitators.map((agitator) => <option key={agitator.id} value={agitator.id}>{agitator.name}</option>)}</select></div>;
              })}
            </div>
          )}
        </section>
      )}

      {tab === "agitators" && (
        <section className="admin-two-column">
          <div className="workspace-card"><span className="eyebrow">КОМАНДА</span><h2>Добавить агитатора</h2><form className="form-grid" onSubmit={addAgitator}><label className="label">Имя<input className="input" name="name" required placeholder="Имя и фамилия" /></label><label className="label">VK ID<input className="input" name="vkId" inputMode="numeric" required placeholder="Например: 394027208" /></label><button className="btn btn-primary btn-large">Добавить</button></form></div>
          <div className="workspace-card"><div className="section-heading"><div><span className="eyebrow">СПИСОК</span><h2>Агитаторы</h2></div><span className="muted">{data.agitators.length}</span></div><div className="people-list">{data.agitators.map((agitator) => { const count = data.assignments.filter((item) => item.agitatorId === agitator.id).length; return <div className="person-row" key={agitator.id}><div className="avatar-circle">{agitator.name.trim().charAt(0).toUpperCase()}</div><div><strong>{agitator.name}</strong><small>VK {agitator.vkId} · {count} заданий</small></div></div>; })}</div></div>
        </section>
      )}

      {tab === "reports" && (
        <section className="workspace-card">
          <div className="reports-toolbar"><div><span className="eyebrow">ФОТООТЧЁТЫ</span><h2>Проверка работ</h2></div><div className="btn-row"><a className="btn btn-primary" href="/api/admin/export">Скачать ZIP</a><button className="btn btn-ghost" onClick={confirmExport}>Отметить выгруженными</button><button className="btn btn-danger" onClick={deleteExported}>Удалить выгруженные</button></div></div>
          {data.reports.length === 0 ? <div className="empty-state compact"><h3>Отчётов пока нет</h3><p>Новые фото появятся здесь после отправки агитаторами.</p></div> : <div className="report-grid">{data.reports.map((report) => <article className="report-card" key={report.id}><div className="report-card-head"><div><strong>{report.address}</strong><small>{report.agitatorName} · {report.distanceMeters} м от точки · {new Date(report.createdAt).toLocaleString("ru-RU")}</small></div><span className={`status-pill status-${report.status.toLowerCase()}`}>{statusText[report.status] || report.status}</span></div><div className="report-photos">{report.photos.map((photo) => <a key={photo.id} href={`/api/admin/photos/${photo.id}`} target="_blank" rel="noreferrer"><img className="report-photo" src={`/api/admin/photos/${photo.id}`} alt="Фотоотчёт" /></a>)}</div><div className="btn-row report-actions"><button className="btn btn-ok" onClick={() => reportAction(report.id, "accept")}>Принять</button><button className="btn btn-danger" onClick={() => reportAction(report.id, "reject")}>Переделать</button>{report.exportedAt && <span className="status-pill status-accepted">Выгружено</span>}</div></article>)}</div>}
        </section>
      )}
    </main>
  );
}
