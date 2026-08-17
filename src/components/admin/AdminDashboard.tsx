"use client";

import { FormEvent, useEffect, useState } from "react";
import { AdminMapClient } from "@/components/admin/AdminMapClient";

type Data = {
  agitators: Array<{ id: string; name: string; vkId: string; active: boolean }>;
  houses: Array<{ id: string; address: string; lat: number; lon: number }>;
  assignments: Array<{ id: string; status: string; agitatorName: string; address: string }>;
  reports: Array<{ id: string; status: string; agitatorName: string; address: string; distanceMeters: number; createdAt: string; exportedAt?: string | null; photos: Array<{ id: string }> }>;
};

export function AdminDashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<string>();
  const [coords, setCoords] = useState({ lat: 57.591, lon: 34.563 });

  async function load() {
    const response = await fetch("/api/admin/data", { cache: "no-store" });
    if (response.status === 401) { setNeedsLogin(true); return; }
    setData(await response.json());
    setNeedsLogin(false);
  }

  useEffect(() => { void load(); }, []);

  async function login(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
    if (!response.ok) { setNotice("Неверный пароль"); return; }
    setPassword(""); setNotice(undefined); await load();
  }

  async function addAgitator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/agitators", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.get("name"), vkId: form.get("vkId") }) });
    setNotice(response.ok ? "Агитатор добавлен" : "Не удалось добавить агитатора");
    if (response.ok) { event.currentTarget.reset(); await load(); }
  }

  async function addHouse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/houses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: form.get("address"), note: form.get("note"), agitatorId: form.get("agitatorId"), lat: coords.lat, lon: coords.lon }) });
    setNotice(response.ok ? "Дом добавлен на карту" : "Не удалось добавить дом");
    if (response.ok) { event.currentTarget.reset(); await load(); }
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
    return <main className="shell"><div className="card" style={{ maxWidth: 440, margin: "12vh auto" }}><h2>Админ-панель AGIT</h2><form className="form-grid" onSubmit={login}><label className="label">Пароль<input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus /></label><button className="btn btn-primary">Войти</button></form>{notice && <div className="notice notice-danger" style={{ marginTop: 10 }}>{notice}</div>}</div></main>;
  }

  if (!data) return <main className="shell"><div className="card">Загрузка…</div></main>;

  return (
    <main className="shell">
      <div className="topbar"><div className="brand"><span className="brand-mark">A</span> AGIT / штаб</div><a className="btn" href="/">Карта агитатора</a></div>
      {notice && <div className="notice notice-ok" style={{ marginBottom: 12 }}>{notice}</div>}
      <div className="stats">
        <div className="stat"><span className="muted">Агитаторов</span><strong>{data.agitators.length}</strong></div>
        <div className="stat"><span className="muted">Домов</span><strong>{data.houses.length}</strong></div>
        <div className="stat"><span className="muted">Отчётов</span><strong>{data.reports.length}</strong></div>
      </div>
      <div className="grid grid-2">
        <section className="card"><h3 className="section-title">Добавить агитатора</h3><form className="form-grid" onSubmit={addAgitator}><label className="label">Имя<input className="input" name="name" required /></label><label className="label">VK ID<input className="input" name="vkId" inputMode="numeric" required placeholder="123456789" /></label><button className="btn btn-primary">Добавить</button></form><div className="divider" /><div className="list">{data.agitators.map((a) => <div className="list-item" key={a.id}><strong>{a.name}</strong><div className="muted">VK ID {a.vkId}</div></div>)}</div></section>
        <section className="card"><h3 className="section-title">Добавить дом</h3><form className="form-grid" onSubmit={addHouse}><label className="label">Адрес<input className="input" name="address" required /></label><label className="label">Примечание<input className="input" name="note" /></label><label className="label">Назначить<select className="input" name="agitatorId"><option value="">Без назначения</option>{data.agitators.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><div className="grid grid-2"><label className="label">Широта<input className="input" value={coords.lat.toFixed(6)} onChange={(e) => setCoords((p) => ({ ...p, lat: Number(e.target.value) }))} /></label><label className="label">Долгота<input className="input" value={coords.lon.toFixed(6)} onChange={(e) => setCoords((p) => ({ ...p, lon: Number(e.target.value) }))} /></label></div><button className="btn btn-primary">Добавить дом</button></form><p className="muted">Кликни по карте ниже — координаты подставятся автоматически.</p></section>
      </div>
      <section className="card" style={{ marginTop: 14 }}><h3 className="section-title">Карта домов</h3><div className="map-wrap"><AdminMapClient points={data.houses} onPick={(lat, lon) => setCoords({ lat, lon })} /></div></section>
      <section className="card" style={{ marginTop: 14 }}><div className="topbar"><h3 className="section-title" style={{ margin: 0 }}>Фотоотчёты</h3><div className="btn-row"><a className="btn btn-primary" href="/api/admin/export">Скачать ZIP</a><button className="btn" onClick={confirmExport}>Подтвердить выгрузку</button><button className="btn btn-danger" onClick={deleteExported}>Удалить выгруженные фото</button></div></div><div className="list">{data.reports.map((r) => <div className="list-item" key={r.id}><div className="topbar" style={{ marginBottom: 4 }}><div><strong>{r.address}</strong><div className="muted">{r.agitatorName} · {r.distanceMeters} м · {new Date(r.createdAt).toLocaleString("ru-RU")}</div></div><span className={`badge ${r.status === "ACCEPTED" ? "badge-ok" : r.status === "REJECTED" ? "badge-danger" : "badge-warn"}`}>{r.status}</span></div><div className="report-photos">{r.photos.map((p) => <a key={p.id} href={`/api/admin/photos/${p.id}`} target="_blank" rel="noreferrer"><img className="report-photo" src={`/api/admin/photos/${p.id}`} alt="Фотоотчёт" /></a>)}</div><div className="btn-row" style={{ marginTop: 8 }}><button className="btn btn-ok" onClick={() => reportAction(r.id, "accept")}>Принять</button><button className="btn btn-danger" onClick={() => reportAction(r.id, "reject")}>Отклонить</button>{r.exportedAt && <span className="badge badge-ok">выгружено</span>}</div></div>)}</div></section>
    </main>
  );
}
