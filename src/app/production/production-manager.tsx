"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Unit = {
  id: string;
  die_model_id: string;
  unit_sequence: number;
  physical_unit_code: string | null;
  status: string;
  die_models: { control_number: string; description: string } | null;
};
type Machine = {
  id: string;
  machine_code: string;
  machine_status: string;
  dpcs_machine_types: { machine_type: string } | null;
};
type QCInspection = {
  id: string;
  die_unit_id: string;
  result: "good" | "reject";
  inspector_name: string;
  findings: string | null;
  notes: string | null;
  created_at: string;
};
type Assignment = {
  id: string;
  machine_id: string;
  die_unit_id: string;
  operator_name: string | null;
  notes: string | null;
  assigned_at: string;
  released_at: string | null;
  dpcs_machines: {
    machine_code: string;
    dpcs_machine_types: { machine_type: string } | null;
  } | null;
};

function dateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

export default function ProductionManager() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [qcInspections, setQcInspections] = useState<QCInspection[]>([]);
  const [view, setView] = useState<"active" | "history">("active");
  const [selectedMachines, setSelectedMachines] = useState<Record<string, string>>({});
  const [operators, setOperators] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [reportUnitId, setReportUnitId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const db = createClient();
      const [unitResult, machineResult, assignmentResult, qcResult] = await Promise.all([
        db.from("die_units")
          .select("id,die_model_id,unit_sequence,physical_unit_code,status,die_models(control_number,description)")
          .order("created_at", { ascending: false }),
        db.from("dpcs_machines")
          .select("id,machine_code,machine_status,dpcs_machine_types(machine_type)")
          .order("machine_code"),
        db.from("dpcs_machine_assignments")
          .select("id,machine_id,die_unit_id,operator_name,notes,assigned_at,released_at,dpcs_machines(machine_code,dpcs_machine_types(machine_type))")
          .order("assigned_at", { ascending: false }),
        db.from("die_unit_qc_inspections")
          .select("id,die_unit_id,result,inspector_name,findings,notes,created_at")
          .order("created_at", { ascending: false }),
      ]);
      const failed = [unitResult, machineResult, assignmentResult, qcResult].find((result) => result.error);
      if (failed?.error) throw failed.error;
      setUnits((unitResult.data ?? []) as unknown as Unit[]);
      setMachines((machineResult.data ?? []) as unknown as Machine[]);
      setAssignments((assignmentResult.data ?? []) as unknown as Assignment[]);
      setQcInspections((qcResult.data ?? []) as QCInspection[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Data Workcard gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const latestQCByUnit = useMemo(() => {
    const latest = new Map<string, QCInspection>();
    for (const inspection of qcInspections) {
      if (!latest.has(inspection.die_unit_id)) latest.set(inspection.die_unit_id, inspection);
    }
    return latest;
  }, [qcInspections]);

  const activeUnits = useMemo(() => units.filter((unit) => latestQCByUnit.get(unit.id)?.result !== "good"), [units, latestQCByUnit]);
  const historyUnits = useMemo(() => units.filter((unit) => latestQCByUnit.get(unit.id)?.result === "good"), [units, latestQCByUnit]);
  const viewUnits = view === "history" ? historyUnits : activeUnits;

  const visibleUnits = useMemo(() => {
    const q = search.trim().toLowerCase();
    return viewUnits.filter((unit) => !q || [
      unit.die_models?.control_number ?? "",
      unit.die_models?.description ?? "",
      unit.physical_unit_code ?? "",
    ].some((value) => value.toLowerCase().includes(q)));
  }, [viewUnits, search]);

  const availableMachines = machines.filter((item) => item.machine_status === "available");

  const reportUnit = viewUnits.find((unit) => unit.id === reportUnitId) ?? viewUnits[0] ?? null;
  const reportHistory = reportUnit
    ? assignments
        .filter((item) => item.die_unit_id === reportUnit.id)
        .sort((a, b) => new Date(a.assigned_at).getTime() - new Date(b.assigned_at).getTime())
    : [];

  async function startWork(unit: Unit) {
    const machineId = selectedMachines[unit.id];
    const operatorName = (operators[unit.id] ?? "").trim();
    if (!machineId) {
      setError("Pilih mesin yang akan digunakan.");
      setNotice("");
      return;
    }
    if (!operatorName) {
      setError("Nama operator wajib diisi.");
      setNotice("");
      return;
    }
    setSaving(unit.id);
    setError("");
    setNotice("");
    try {
      const db = createClient();
      const { error: startError } = await db.rpc("dpcs_assign_machine_work", {
        p_machine_id: machineId,
        p_die_unit_id: unit.id,
        p_operator_name: operatorName,
        p_notes: (notes[unit.id] ?? "").trim() || null,
      });
      if (startError) throw startError;
      setNotice("Pekerjaan berhasil dimulai dan tercatat di riwayat Workcard.");
      setSelectedMachines((current) => ({ ...current, [unit.id]: "" }));
      setOperators((current) => ({ ...current, [unit.id]: "" }));
      setNotes((current) => ({ ...current, [unit.id]: "" }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pekerjaan mesin gagal dimulai.");
    } finally {
      setSaving(null);
    }
  }

  async function finishWork(item: Assignment) {
    setSaving(item.id);
    setError("");
    setNotice("");
    try {
      const db = createClient();
      const { error: finishError } = await db.rpc("dpcs_release_machine", { p_assignment_id: item.id });
      if (finishError) throw finishError;
      setNotice("Pekerjaan selesai. Riwayat tersimpan dan mesin kembali tersedia.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pekerjaan gagal diselesaikan.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <main className="page-shell order-page production-page">
      <header className="topbar">
        <Link className="back-link" href="/">← DPCS</Link>
        <div className="topbar-copy"><p className="eyebrow">MODUL 03</p><h1>Production Monitoring</h1></div>
        <span className="environment">WORKCARD</span>
      </header>
      <section className="order-intro">
        <p className="eyebrow">PERJALANAN PRODUKSI SETIAP UNIT DIES</p>
        <h2>Catat perjalanan dies dari mesin ke mesin.</h2>
        <p className="hero-copy">Pilih mesin yang tersedia, catat operator, lalu mulai pekerjaan. Setiap kunjungan ke mesin menjadi catatan baru. Unit boleh kembali ke mesin yang sama tanpa menimpa riwayat sebelumnya.</p>
      </section>
      <section className="production-summary">
        <article><span>Total unit dies</span><strong>{units.length}</strong></article>
        <article><span>Dalam produksi aktif</span><strong>{activeUnits.length}</strong></article>
        <article><span>Lolos QC / History</span><strong>{historyUnits.length}</strong></article>
      </section>
      <nav className="production-view-switch" aria-label="Tampilan Production Monitoring">
        <button type="button" className={view === "active" ? "is-selected" : ""} onClick={() => { setView("active"); setSearch(""); setReportUnitId(""); }}>
          Active Production <span>{activeUnits.length}</span>
        </button>
        <button type="button" className={view === "history" ? "is-selected" : ""} onClick={() => { setView("history"); setSearch(""); setReportUnitId(""); }}>
          Production History <span>{historyUnits.length}</span>
        </button>
      </nav>
      <div className="production-toolbar">
        <input aria-label="Cari unit dies" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari Control Number atau marking fisik..." />
        <button type="button" onClick={() => void load()} disabled={loading}>Muat ulang</button>
      </div>
      {!loading && viewUnits.length > 0 && (
        <section className="production-unit-panel">
          <article className="production-process-card">
            <div className="production-process-title">
              <div><h4>Laporan perjalanan produksi</h4><p>Rekam perjalanan unit dies secara berurutan, dari mesin pertama hingga kunjungan terakhir.</p></div>
            </div>
            <div className="production-fields">
              <label>Pilih unit dies untuk laporan
                <select value={reportUnit?.id ?? ""} onChange={(event) => setReportUnitId(event.target.value)}>
                  {viewUnits.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {(unit.die_models?.control_number ?? "Tanpa Control Number") + " · " + (unit.physical_unit_code || `Unit #${unit.unit_sequence}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {reportUnit && (
              <>
                <p><strong>Control Number:</strong> {reportUnit.die_models?.control_number ?? "—"} · <strong>Unit:</strong> {reportUnit.physical_unit_code || `Unit #${reportUnit.unit_sequence}`}</p>
                <p><strong>Total kunjungan mesin:</strong> {reportHistory.length}</p>
                {reportHistory.length === 0 ? <p className="hero-copy">Belum ada perjalanan mesin yang tercatat untuk unit ini.</p> : (
                  <div className="qc-history">
                    {reportHistory.map((item, index) => (
                      <div className="qc-history-row" key={item.id}>
                        <div className="qc-history-title"><strong>{index + 1}. {item.dpcs_machines?.machine_code ?? "Mesin"}</strong><span>{item.dpcs_machines?.dpcs_machine_types?.machine_type ?? "Jenis mesin"}</span></div>
                        <p>Operator: {item.operator_name || "—"}</p>
                        <p>Mulai: {dateTime(item.assigned_at)} · Selesai: {dateTime(item.released_at)}</p>
                        {item.notes && <p>Catatan: {item.notes}</p>}
                        <span className={`production-status production-status-${item.released_at ? "completed" : "in_progress"}`}>{item.released_at ? "Selesai" : "Aktif"}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </article>
        </section>
      )}
      {notice && <div className="notice notice-info">{notice}</div>}
      {error && <div className="notice notice-warning">{error}</div>}
      {loading ? <div className="dashboard-message">Memuat Workcard dan status QC dari database...</div> :
        visibleUnits.length === 0 ? (
          <div className="dashboard-message">
            {view === "active"
              ? "Tidak ada unit aktif yang cocok. Unit dengan hasil QC terakhir GOOD dapat dilihat pada Production History."
              : "Belum ada unit yang lolos QC. Setelah hasil QC terakhir GOOD, unit akan muncul otomatis di Production History."}
          </div>
        ) :
        visibleUnits.map((unit) => {
          const unitLabel = unit.physical_unit_code || `Unit #${unit.unit_sequence}`;
          const history = assignments.filter((item) => item.die_unit_id === unit.id);
          const active = history.find((item) => !item.released_at);
          const qcHistory = qcInspections.filter((item) => item.die_unit_id === unit.id);
          const latestQC = latestQCByUnit.get(unit.id);
          return (
            <section className="production-unit-panel" key={unit.id}>
              <div className="production-unit-heading">
                <div><p className="eyebrow">CONTROL NUMBER · {unit.die_models?.control_number ?? "—"}</p><h3>{unitLabel}</h3><p>{unit.die_models?.description ?? "Deskripsi dies tidak tersedia"}</p></div>
                <span>{view === "history" ? "LOLOS QC" : unit.status.replaceAll("_", " ")}</span>
              </div>
              <article className="production-process-card">
                <div className="production-process-title">
                  <div><h4>Hasil QC terakhir</h4><p>{latestQC ? latestQC.result.toUpperCase() + " · " + dateTime(latestQC.created_at) + " · " + latestQC.inspector_name : "Belum ada pemeriksaan QC"}</p></div>
                  {latestQC && <span className={latestQC.result === "good" ? "production-status production-status-completed" : "production-status production-status-hold"}>{latestQC.result.toUpperCase()}</span>}
                </div>
                {qcHistory.length > 0 && (
                  <div className="qc-history">
                    <h4>Riwayat pemeriksaan QC ({qcHistory.length})</h4>
                    {qcHistory.map((inspection, index) => (
                      <div className="qc-history-row" key={inspection.id}>
                        <div className="qc-history-title"><strong>{qcHistory.length - index}. {inspection.result.toUpperCase()}</strong><span>{dateTime(inspection.created_at)}</span></div>
                        <p>Inspektor: {inspection.inspector_name}</p>
                        {inspection.findings && <p>Temuan: {inspection.findings}</p>}
                        {inspection.notes && <p>Catatan: {inspection.notes}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </article>
              {view === "active" && <article className="production-process-card">
                <div className="production-process-title">
                  <div><h4>{active ? "Pekerjaan sedang berlangsung" : "Mulai pekerjaan mesin"}</h4><p>Operator dan mesin dicatat pada setiap kunjungan</p></div>
                  <span className={`production-status production-status-${active ? "in_progress" : "pending"}`}>{active ? "Sedang dikerjakan" : "Menunggu mesin"}</span>
                </div>
                {active ? (
                  <div className="production-fields">
                    <div><strong>{active.dpcs_machines?.machine_code ?? "Mesin"}</strong><p>{active.dpcs_machines?.dpcs_machine_types?.machine_type ?? "Jenis mesin"}</p><p>Operator: {active.operator_name || "—"}</p><p>Mulai: {dateTime(active.assigned_at)}</p></div>
                    <div><p>{active.notes || "Tidak ada catatan."}</p><button type="button" disabled={saving === active.id} onClick={() => void finishWork(active)}>{saving === active.id ? "Memproses..." : "Selesaikan pekerjaan / lepas mesin"}</button></div>
                  </div>
                ) : (
                  <div className="production-fields">
                    <label>Mesin tersedia
                      <select value={selectedMachines[unit.id] ?? ""} onChange={(event) => setSelectedMachines((current) => ({ ...current, [unit.id]: event.target.value }))}>
                        <option value="">Pilih mesin</option>
                        {availableMachines.map((machine) => <option key={machine.id} value={machine.id}>{machine.machine_code} · {machine.dpcs_machine_types?.machine_type ?? "Mesin"}</option>)}
                      </select>
                    </label>
                    <label>Nama operator
                      <input value={operators[unit.id] ?? ""} onChange={(event) => setOperators((current) => ({ ...current, [unit.id]: event.target.value }))} placeholder="Masukkan nama operator" />
                    </label>
                    <label className="production-notes">Catatan pekerjaan
                      <textarea rows={2} value={notes[unit.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [unit.id]: event.target.value }))} placeholder="Opsional: pekerjaan atau instruksi..." />
                    </label>
                    <button type="button" disabled={saving === unit.id || availableMachines.length === 0} onClick={() => void startWork(unit)}>{saving === unit.id ? "Menyimpan..." : "Mulai pekerjaan"}</button>
                  </div>
                )}
              </article>}
              <article className="production-process-card">
                <div className="production-process-title"><div><h4>Riwayat perjalanan mesin</h4><p>{history.length} kunjungan tercatat · urutan terbaru di atas</p></div></div>
                {history.length === 0 ? <p className="hero-copy">Belum ada riwayat pekerjaan untuk unit ini.</p> : (
                  <div className="qc-history">
                    {history.map((item, index) => (
                      <div className="qc-history-row" key={item.id}>
                        <div className="qc-history-title"><strong>{history.length - index}. {item.dpcs_machines?.machine_code ?? "Mesin"}</strong><span>{item.dpcs_machines?.dpcs_machine_types?.machine_type ?? "Jenis mesin"}</span></div>
                        <p>Operator: {item.operator_name || "—"}</p>
                        <p>Mulai: {dateTime(item.assigned_at)} · Selesai: {dateTime(item.released_at)}</p>
                        {item.notes && <p>Catatan: {item.notes}</p>}
                        <span className={`production-status production-status-${item.released_at ? "completed" : "in_progress"}`}>{item.released_at ? "Selesai" : "Aktif"}</span>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </section>
          );
        })}
      <footer className="footer"><span>DPCS · Dies Production Control System</span><Link href="/">Kembali ke dashboard</Link></footer>
    </main>
  );
}
