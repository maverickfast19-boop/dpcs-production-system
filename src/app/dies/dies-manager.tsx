"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Model = { id: string; control_number: string; description: string; material: string; active: boolean };
type Unit = { id: string; die_model_id: string; order_line_id: string | null; unit_sequence: number; physical_unit_code: string | null; status: string; location: string | null };
type Line = { id: string; die_order_id: string; description_snapshot: string; material_snapshot: string };
type Order = { id: string; po_date: string; due_date: string; customer_id: string; source_reference: string | null };
type Customer = { id: string; customer_name: string };

const statusOptions = [
  ["ordered", "Menunggu produksi"], ["in_production", "Dalam produksi"],
  ["manufactured", "Selesai dibuat"], ["available", "Tersedia"],
  ["in_use", "Sedang digunakan"], ["maintenance", "Maintenance"],
  ["repair", "Perbaikan"], ["scrapped", "Tidak digunakan"],
];
const fmtDate = (value: string) => new Date(value + "T00:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });

export default function DiesManager() {
  const [models, setModels] = useState<Model[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [markings, setMarkings] = useState<Record<string, string>>({});
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [showModelForm, setShowModelForm] = useState(false);
  const [showUnitsForm, setShowUnitsForm] = useState(false);
  const [modelSaving, setModelSaving] = useState(false);
  const [unitsSaving, setUnitsSaving] = useState(false);
  const [newControlNumber, setNewControlNumber] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newMaterial, setNewMaterial] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [newQuantity, setNewQuantity] = useState("1");
  const [newStatus, setNewStatus] = useState("available");
  const [newMarkings, setNewMarkings] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const db = createClient();
      const results = await Promise.all([
        db.from("die_models").select("id,control_number,description,material,active").order("control_number"),
        db.from("die_units").select("id,die_model_id,order_line_id,unit_sequence,physical_unit_code,status,location").order("created_at", { ascending: false }),
        db.from("die_order_lines").select("id,die_order_id,description_snapshot,material_snapshot"),
        db.from("die_orders").select("id,po_date,due_date,customer_id,source_reference"),
        db.from("customers").select("id,customer_name"),
      ]);
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
      setModels((results[0].data ?? []) as Model[]);
      setUnits((results[1].data ?? []) as Unit[]);
      setLines((results[2].data ?? []) as Line[]);
      setOrders((results[3].data ?? []) as Order[]);
      setCustomers((results[4].data ?? []) as Customer[]);
      setMarkings(Object.fromEntries((results[1].data ?? []).map((u: Unit) => [u.id, u.physical_unit_code ?? ""])));
      setStatuses(Object.fromEntries((results[1].data ?? []).map((u: Unit) => [u.id, u.status])));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Data Control Number dan dies gagal dimuat.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void load();
    const db = createClient();
    db.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setIsAdmin(false); return; }
      const { data: profile } = await db.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
      setIsAdmin(profile?.role === "admin");
    });
  }, [load]);

  const lookup = useMemo(() => {
    const lineMap = new Map(lines.map((x) => [x.id, x]));
    const orderMap = new Map(orders.map((x) => [x.id, x]));
    const customerMap = new Map(customers.map((x) => [x.id, x.customer_name]));
    return { lineMap, orderMap, customerMap };
  }, [lines, orders, customers]);

  const visibleModels = useMemo(() => {
    const q = search.trim().toLowerCase();
    return models.filter((m) => !q || [m.control_number, m.description, m.material].some((v) => v.toLowerCase().includes(q)));
  }, [models, search]);

  async function registerModel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setModelSaving(true); setNotice(""); setError("");
    try {
      const db = createClient();
      const { data, error: rpcError } = await db.rpc("register_manual_die_model", {
        p_control_number: newControlNumber.trim(),
        p_description: newDescription.trim(),
        p_material: newMaterial.trim(),
      });
      if (rpcError) throw rpcError;
      setNotice("Control Number berhasil didaftarkan.");
      setNewControlNumber(""); setNewDescription(""); setNewMaterial("");
      setShowModelForm(false);
      await load();
      if (data) setSelectedModelId(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Registrasi Control Number gagal.");
    } finally { setModelSaving(false); }
  }

  async function registerUnits(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const quantity = Number(newQuantity);
    const enteredMarkings = newMarkings.trim()
      ? newMarkings.split(",").map((value) => value.trim())
      : null;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500) {
      setError("Jumlah unit harus antara 1 sampai 500."); return;
    }
    if (enteredMarkings && enteredMarkings.length !== quantity) {
      setError("Jumlah marking harus sama dengan jumlah unit, pisahkan dengan koma, atau kosongkan seluruh marking."); return;
    }
    setUnitsSaving(true); setNotice(""); setError("");
    try {
      const db = createClient();
      const { error: rpcError } = await db.rpc("register_manual_die_units", {
        p_die_model_id: selectedModelId,
        p_quantity: quantity,
        p_initial_status: newStatus,
        p_markings: enteredMarkings,
      });
      if (rpcError) throw rpcError;
      setNotice(quantity + " unit dies berhasil diregistrasikan.");
      setNewQuantity("1"); setNewStatus("available"); setNewMarkings("");
      setShowUnitsForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Registrasi unit dies gagal.");
    } finally { setUnitsSaving(false); }
  }

  async function saveUnit(unit: Unit) {
    setSaving(unit.id); setNotice(""); setError("");
    const code = (markings[unit.id] ?? "").trim();
    try {
      const db = createClient();
      const { error: updateError } = await db.from("die_units").update({
        physical_unit_code: code || null,
        status: statuses[unit.id] ?? unit.status,
      }).eq("id", unit.id);
      if (updateError) throw updateError;
      setUnits((current) => current.map((u) => u.id === unit.id ? { ...u, physical_unit_code: code || null, status: statuses[unit.id] ?? u.status } : u));
      setNotice("Perubahan unit berhasil disimpan.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Perubahan unit gagal disimpan. Pastikan kode marking belum digunakan unit lain.");
    } finally { setSaving(null); }
  }

  return (
    <main className="page-shell order-page dies-page">
      <header className="topbar">
        <Link className="back-link" href="/">← DPCS</Link>
        <div className="topbar-copy"><p className="eyebrow">MODUL 02</p><h1>Control Number & Dies</h1></div>
        <span className="environment">MASTER DIES</span>
      </header>
      <section className="order-intro">
        <p className="eyebrow">MASTER CONTROL NUMBER DAN UNIT FISIK</p>
        <h2>Satu Control Number, banyak unit dies.</h2>
        <p className="hero-copy">Control Number mewakili model atau spesifikasi dies. Setiap unit fisik memiliki nomor urut, marking pabrik, dan status masing-masing. Marking dapat diisi setelah identitas fisik benar-benar diberikan di lapangan.</p>
      </section>
      <section className="dies-summary">
        <article><span>Control Number</span><strong>{models.length}</strong></article>
        <article><span>Total unit fisik</span><strong>{units.length}</strong></article>
        <article><span>Belum diberi marking</span><strong>{units.filter((u) => !u.physical_unit_code).length}</strong></article>
      </section>
      {isAdmin && <section className="dies-admin-actions">
        <button type="button" onClick={() => { setShowModelForm((v) => !v); setShowUnitsForm(false); setError(""); }}>
          {showModelForm ? "Tutup formulir" : "+ Tambah Control Number"}
        </button>
        <button type="button" onClick={() => { setShowUnitsForm((v) => !v); setShowModelForm(false); setError(""); }} disabled={models.length === 0}>
          {showUnitsForm ? "Tutup formulir" : "+ Registrasi Unit Dies"}
        </button>
      </section>}
      {isAdmin && showModelForm && <section className="dies-form-panel">
        <h3>Registrasi Control Number baru</h3>
        <p>Isi identitas model dies. Data ini tidak harus memiliki PO atau Customer.</p>
        <form className="dies-form-grid" onSubmit={registerModel}>
          <label>Control Number<input required value={newControlNumber} onChange={(e) => setNewControlNumber(e.target.value)} placeholder="Contoh: CN-001" /></label>
          <label>Deskripsi dies<input required value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Nama atau spesifikasi dies" /></label>
          <label>Material<input required value={newMaterial} onChange={(e) => setNewMaterial(e.target.value)} placeholder="Contoh: SKD11" /></label>
          <button type="submit" disabled={modelSaving}>{modelSaving ? "Mendaftarkan..." : "Simpan Control Number"}</button>
        </form>
      </section>}
      {isAdmin && showUnitsForm && <section className="dies-form-panel">
        <h3>Registrasi unit fisik dies</h3>
        <p>Pilih Control Number, jumlah unit, dan status awal. Marking boleh dikosongkan jika belum tersedia.</p>
        <form className="dies-form-grid" onSubmit={registerUnits}>
          <label>Control Number<select required value={selectedModelId} onChange={(e) => setSelectedModelId(e.target.value)}>
            <option value="">Pilih Control Number</option>
            {models.filter((m) => m.active).map((m) => <option value={m.id} key={m.id}>{m.control_number} — {m.description}</option>)}
          </select></label>
          <label>Jumlah unit<input required type="number" min="1" max="500" value={newQuantity} onChange={(e) => setNewQuantity(e.target.value)} /></label>
          <label>Status awal<select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>{statusOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label className="dies-form-wide">Marking fisik (opsional, pisahkan dengan koma sesuai jumlah unit)<input value={newMarkings} onChange={(e) => setNewMarkings(e.target.value)} placeholder="Contoh: DIE-001, DIE-002 (kosongkan bila belum ada)" /></label>
          <button type="submit" disabled={unitsSaving || !selectedModelId}>{unitsSaving ? "Mendaftarkan..." : "Registrasikan Unit Dies"}</button>
        </form>
      </section>}
      <section className="dies-toolbar">
        <input aria-label="Cari Control Number" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari Control Number, deskripsi, atau material..." />
        <button type="button" onClick={() => void load()} disabled={loading}>Muat ulang data</button>
      </section>
      {notice && <div className="notice notice-info">{notice}</div>}
      {error && <div className="notice notice-warning">{error}</div>}
      {loading ? <div className="dashboard-message">Mengambil data master dies dari database...</div> :
        visibleModels.length === 0 ? <div className="dashboard-message">Belum ada Control Number yang cocok. Data master akan terbentuk dari impor Order Manajemen.</div> :
        visibleModels.map((model) => {
          const modelUnits = units.filter((u) => u.die_model_id === model.id);
          return <section className="dies-model-panel" key={model.id}>
            <div className="dies-model-heading">
              <div><p className="eyebrow">CONTROL NUMBER</p><h3>{model.control_number}</h3><p>{model.description} · Material: {model.material}</p></div>
              <span>{modelUnits.length} unit fisik</span>
            </div>
            {modelUnits.length === 0 ? <p className="dashboard-empty">Belum ada unit fisik untuk Control Number ini.</p> :
              <div className="table-scroll"><table className="dies-table">
                <thead><tr><th>Unit</th><th>Customer / Order</th><th>Marking fisik pabrik</th><th>Status</th><th>Aksi</th></tr></thead>
                <tbody>{modelUnits.map((unit) => {
                  const line = unit.order_line_id ? lookup.lineMap.get(unit.order_line_id) : undefined;
                  const order = line ? lookup.orderMap.get(line.die_order_id) : undefined;
                  return <tr key={unit.id}>
                    <td><strong>{model.control_number} #{unit.unit_sequence}</strong></td>
                    <td>{order ? (lookup.customerMap.get(order.customer_id) ?? "Customer") : "—"}<small>{order ? "PO " + fmtDate(order.po_date) + " · Due " + fmtDate(order.due_date) : unit.order_line_id ? "Order tidak ditemukan" : "Registrasi manual · Tanpa Order"}</small></td>
                    <td><input className="marking-input" value={markings[unit.id] ?? ""} onChange={(e) => setMarkings((v) => ({ ...v, [unit.id]: e.target.value }))} placeholder="Contoh: 26X0043 #1" /></td>
                    <td><select value={statuses[unit.id] ?? unit.status} onChange={(e) => setStatuses((v) => ({ ...v, [unit.id]: e.target.value }))}>{statusOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></td>
                    <td><button className="dies-save" type="button" disabled={saving === unit.id} onClick={() => void saveUnit(unit)}>{saving === unit.id ? "Menyimpan..." : "Simpan"}</button></td>
                  </tr>;
                })}</tbody>
              </table></div>}
          </section>;
        })}
      <footer className="footer"><span>DPCS · Dies Production Control System</span><Link href="/">Kembali ke dashboard</Link></footer>
    </main>
  );
}
