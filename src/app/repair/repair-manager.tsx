"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type WorkOrder = {
  id: string;
  qc_inspection_id: string;
  die_unit_id: string;
  repair_scope: string;
  assigned_technician: string | null;
  target_completion_date: string | null;
  status: "pending" | "in_progress" | "completed" | "hold";
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};
type Unit = { id: string; die_model_id: string; unit_sequence: number; physical_unit_code: string | null };
type Model = { id: string; control_number: string; description: string };
type Inspection = { id: string; findings: string | null; inspector_name: string; created_at: string };
type RepairAction = { id: string; repair_work_order_id: string; action_description: string; parts_used: string | null; performed_by: string; created_at: string };
type Draft = { assigned_technician: string; target_completion_date: string; status: WorkOrder["status"]; action_description: string; parts_used: string; performed_by: string };

const statusLabels: Record<WorkOrder["status"], string> = {
  pending: "Belum dimulai",
  in_progress: "Sedang diperbaiki",
  completed: "Selesai – siap QC ulang",
  hold: "HOLD",
};
const blankDraft = (): Draft => ({ assigned_technician: "", target_completion_date: "", status: "pending", action_description: "", parts_used: "", performed_by: "" });
const dateLabel = (value: string | null) => value ? new Date(value).toLocaleDateString("id-ID", { dateStyle: "medium" }) : "—";
const dateTime = (value: string) => new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });

export default function RepairManager() {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [actions, setActions] = useState<RepairAction[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const db = createClient();
      const [orderResult, unitResult, modelResult, inspectionResult, actionResult] = await Promise.all([
        db.from("die_unit_repair_work_orders").select("*").order("created_at", { ascending: false }),
        db.from("die_units").select("id,die_model_id,unit_sequence,physical_unit_code"),
        db.from("die_models").select("id,control_number,description"),
        db.from("die_unit_qc_inspections").select("id,findings,inspector_name,created_at"),
        db.from("die_unit_repair_actions").select("*").order("created_at", { ascending: false }),
      ]);
      const failed = [orderResult, unitResult, modelResult, inspectionResult, actionResult].find((item) => item.error);
      if (failed?.error) throw failed.error;
      setOrders((orderResult.data ?? []) as WorkOrder[]);
      setUnits((unitResult.data ?? []) as Unit[]);
      setModels((modelResult.data ?? []) as Model[]);
      setInspections((inspectionResult.data ?? []) as Inspection[]);
      setActions((actionResult.data ?? []) as RepairAction[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Data Repair & Rework gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const unitMap = useMemo(() => new Map(units.map((item) => [item.id, item])), [units]);
  const modelMap = useMemo(() => new Map(models.map((item) => [item.id, item])), [models]);
  const inspectionMap = useMemo(() => new Map(inspections.map((item) => [item.id, item])), [inspections]);
  const visibleOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((order) => {
      const unit = unitMap.get(order.die_unit_id);
      const model = unit ? modelMap.get(unit.die_model_id) : undefined;
      return !q || [model?.control_number ?? "", model?.description ?? "", unit?.physical_unit_code ?? "", order.assigned_technician ?? "", order.repair_scope]
        .some((value) => value.toLowerCase().includes(q));
    });
  }, [orders, unitMap, modelMap, search]);

  function draftFor(order: WorkOrder): Draft {
    return drafts[order.id] ?? {
      ...blankDraft(),
      assigned_technician: order.assigned_technician ?? "",
      target_completion_date: order.target_completion_date ?? "",
      status: order.status,
    };
  }
  function updateDraft(id: string, patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [id]: { ...(current[id] ?? blankDraft()), ...patch } }));
  }

  async function saveWork(order: WorkOrder) {
    const draft = draftFor(order);
    setSaving(order.id);
    setError("");
    setNotice("");
    try {
      const now = new Date().toISOString();
      const payload = {
        assigned_technician: draft.assigned_technician.trim() || null,
        target_completion_date: draft.target_completion_date || null,
        status: draft.status,
        started_at: draft.status === "pending" ? null : (order.started_at || now),
        completed_at: draft.status === "completed" ? (order.completed_at || now) : null,
        updated_at: now,
      };
      const db = createClient();
      const { error: updateError } = await db.from("die_unit_repair_work_orders").update(payload).eq("id", order.id);
      if (updateError) throw updateError;
      setNotice(draft.status === "completed"
        ? "Pekerjaan perbaikan disimpan selesai. Unit siap diajukan untuk QC ulang."
        : "Data pekerjaan perbaikan berhasil disimpan.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pekerjaan perbaikan gagal disimpan.");
    } finally {
      setSaving(null);
    }
  }

  async function addAction(order: WorkOrder) {
    const draft = draftFor(order);
    if (!draft.action_description.trim() || !draft.performed_by.trim()) {
      setError("Uraian tindakan dan nama teknisi wajib diisi.");
      setNotice("");
      return;
    }
    setSaving(order.id);
    setError("");
    setNotice("");
    try {
      const db = createClient();
      const { error: insertError } = await db.from("die_unit_repair_actions").insert({
        repair_work_order_id: order.id,
        action_description: draft.action_description.trim(),
        parts_used: draft.parts_used.trim() || null,
        performed_by: draft.performed_by.trim(),
      });
      if (insertError) throw insertError;
      setDrafts((current) => ({ ...current, [order.id]: { ...draftFor(order), action_description: "", parts_used: "" } }));
      setNotice("Riwayat tindakan perbaikan berhasil dicatat.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tindakan perbaikan gagal dicatat.");
    } finally {
      setSaving(null);
    }
  }

  const completedCount = orders.filter((item) => item.status === "completed").length;
  const activeCount = orders.filter((item) => item.status === "in_progress").length;
  const holdCount = orders.filter((item) => item.status === "hold").length;

  return (
    <main className="page-shell order-page production-page">
      <header className="topbar">
        <Link className="back-link" href="/">← DPCS</Link>
        <div className="topbar-copy"><p className="eyebrow">MODUL 05</p><h1>Repair &amp; Rework Management</h1></div>
        <span className="environment">PERBAIKAN DIES</span>
      </header>
      <section className="order-intro">
        <p className="eyebrow">PENANGANAN HASIL QC REJECT</p>
        <h2>Perbaikan tercatat sampai siap QC ulang.</h2>
        <p className="hero-copy">Work order dibuat otomatis setelah Kepala Produksi memilih REPAIR pada hasil QC REJECT. Setiap tindakan teknisi disimpan sebagai riwayat, tanpa menghapus pemeriksaan sebelumnya.</p>
      </section>
      <section className="production-summary">
        <article><span>Total work order</span><strong>{orders.length}</strong></article>
        <article><span>Sedang diperbaiki</span><strong>{activeCount}</strong></article>
        <article><span>Selesai / HOLD</span><strong>{completedCount} / {holdCount}</strong></article>
      </section>
      <div className="production-toolbar">
        <input aria-label="Cari pekerjaan perbaikan" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari Control Number, marking, atau teknisi..." />
        <button type="button" onClick={() => void load()} disabled={loading}>Muat ulang</button>
      </div>
      {notice && <div className="notice notice-info" role="status">{notice}</div>}
      {error && <div className="notice notice-warning" role="alert">{error}</div>}
      {loading ? <div className="dashboard-message">Memuat pekerjaan perbaikan...</div> :
        visibleOrders.length === 0 ? (
          <div className="dashboard-message">
            Belum ada work order perbaikan. Work order akan muncul otomatis setelah terdapat pemeriksaan QC REJECT yang diputuskan REPAIR oleh Kepala Produksi. Tidak ada data contoh yang dibuat.
          </div>
        ) : visibleOrders.map((order) => {
          const unit = unitMap.get(order.die_unit_id);
          const model = unit ? modelMap.get(unit.die_model_id) : undefined;
          const inspection = inspectionMap.get(order.qc_inspection_id);
          const draft = draftFor(order);
          const orderActions = actions.filter((action) => action.repair_work_order_id === order.id);
          return (
            <section className="production-unit-panel" key={order.id}>
              <div className="production-unit-heading">
                <div>
                  <p className="eyebrow">CONTROL NUMBER · {model?.control_number ?? "—"}</p>
                  <h3>{unit?.physical_unit_code || (unit ? `Unit #${unit.unit_sequence} (belum diberi marking)` : "Unit tidak ditemukan")}</h3>
                  <p>{model?.description ?? "Deskripsi dies tidak tersedia"}</p>
                </div>
                <span>{statusLabels[order.status]}</span>
              </div>
              <div className="dashboard-panel" style={{ marginTop: 0, marginBottom: 14 }}>
                <strong>Dasar perbaikan</strong>
                <p style={{ color: "var(--muted)", fontSize: 12, lineHeight: 1.6 }}>{order.repair_scope}</p>
                <small style={{ color: "var(--muted)" }}>QC oleh {inspection?.inspector_name ?? "—"} · {inspection ? dateTime(inspection.created_at) : "Waktu QC tidak tersedia"}</small>
              </div>
              <div className="production-fields">
                <label>Teknisi penanggung jawab<input value={draft.assigned_technician} onChange={(event) => updateDraft(order.id, { assigned_technician: event.target.value })} placeholder="Nama teknisi" /></label>
                <label>Target selesai<input type="date" value={draft.target_completion_date} onChange={(event) => updateDraft(order.id, { target_completion_date: event.target.value })} /></label>
                <label>Status<select value={draft.status} onChange={(event) => updateDraft(order.id, { status: event.target.value as WorkOrder["status"] })}>
                  <option value="pending">Belum dimulai</option><option value="in_progress">Sedang diperbaiki</option><option value="completed">Selesai – siap QC ulang</option><option value="hold">HOLD</option>
                </select></label>
              </div>
              <div className="production-process-footer">
                <small>Dibuat: {dateTime(order.created_at)} · Target: {dateLabel(order.target_completion_date)}</small>
                <button type="button" disabled={saving === order.id} onClick={() => void saveWork(order)}>{saving === order.id ? "Menyimpan..." : "Simpan pekerjaan"}</button>
              </div>
              <div className="qc-history">
                <h4>Riwayat tindakan perbaikan ({orderActions.length})</h4>
                {orderActions.length === 0 ? <p className="dashboard-empty">Belum ada tindakan yang dicatat.</p> : orderActions.map((action) => (
                  <div className="qc-history-row" key={action.id}>
                    <div className="qc-history-title"><strong>{action.performed_by}</strong><span>{dateTime(action.created_at)}</span></div>
                    <p>{action.action_description}</p>
                    {action.parts_used && <p>Komponen / material: {action.parts_used}</p>}
                  </div>
                ))}
              </div>
              <div className="qc-entry-card" style={{ marginTop: 14 }}>
                <h4>Catat tindakan teknisi</h4>
                <div className="qc-fields">
                  <label className="qc-wide">Uraian tindakan<input value={draft.action_description} onChange={(event) => updateDraft(order.id, { action_description: event.target.value })} placeholder="Contoh: polishing area insert..." /></label>
                  <label>Komponen / material digunakan<input value={draft.parts_used} onChange={(event) => updateDraft(order.id, { parts_used: event.target.value })} placeholder="Opsional" /></label>
                  <label>Nama teknisi<input value={draft.performed_by} onChange={(event) => updateDraft(order.id, { performed_by: event.target.value })} placeholder="Nama teknisi pelaksana" /></label>
                </div>
                <button className="qc-save-button" type="button" disabled={saving === order.id} onClick={() => void addAction(order)}>{saving === order.id ? "Menyimpan..." : "Simpan tindakan"}</button>
              </div>
              {order.status === "completed" && <div className="notice notice-info">Unit ini siap menjalani pemeriksaan QC ulang. <Link href="/qc">Buka Modul QC</Link> dan catat inspeksi baru; hasil QC lama tetap menjadi riwayat.</div>}
            </section>
          );
        })}
      <footer className="footer"><span>DPCS · Dies Production Control System</span><Link href="/">Kembali ke dashboard</Link></footer>
    </main>
  );
}
