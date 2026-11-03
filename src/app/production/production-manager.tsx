"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Unit = {
  id: string;
  die_model_id: string;
  order_line_id: string;
  created_at: string;
  die_order_lines: {
    die_order_id: string;
    die_orders: { po_date: string; due_date: string } | null;
  } | null;
  unit_sequence: number;
  physical_unit_code: string | null;
  status: string;
  product_model: string | null;
  die_shape: "box" | "cylinder" | null;
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  diameter_mm: number | null;
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

function formatDuration(hours: number) {
  if (!Number.isFinite(hours) || hours <= 0) return "Belum tersedia";
  const minutes = Math.round(hours * 60);
  const wholeHours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (wholeHours === 0) return `${remainingMinutes} menit`;
  if (remainingMinutes === 0) return `${wholeHours} jam`;
  return `${wholeHours} jam ${remainingMinutes} menit`;
}

function sameWorkcardSpecification(a: Unit, b: Unit) {
  const productA = (a.product_model ?? "").trim().toLocaleLowerCase("id-ID").replace(/\s+/g, " ");
  const productB = (b.product_model ?? "").trim().toLocaleLowerCase("id-ID").replace(/\s+/g, " ");
  if (!productA || productA !== productB || !a.die_shape || a.die_shape !== b.die_shape) return false;
  if (a.die_shape === "box") {
    return a.length_mm != null && a.width_mm != null && a.height_mm != null &&
      b.length_mm != null && b.width_mm != null && b.height_mm != null &&
      a.diameter_mm == null && b.diameter_mm == null &&
      a.length_mm === b.length_mm && a.width_mm === b.width_mm && a.height_mm === b.height_mm;
  }
  return a.die_shape === "cylinder" &&
    a.length_mm != null && a.diameter_mm != null &&
    b.length_mm != null && b.diameter_mm != null &&
    a.width_mm == null && a.height_mm == null &&
    b.width_mm == null && b.height_mm == null &&
    a.length_mm === b.length_mm && a.diameter_mm === b.diameter_mm;
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [specDrafts, setSpecDrafts] = useState<Record<string, {
    product_model: string;
    die_shape: "" | "box" | "cylinder";
    length_mm: string;
    width_mm: string;
    height_mm: string;
    diameter_mm: string;
  }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const db = createClient();
      const [unitResult, machineResult, assignmentResult, qcResult] = await Promise.all([
        db.from("die_units")
          .select("id,die_model_id,order_line_id,created_at,unit_sequence,physical_unit_code,status,product_model,die_shape,length_mm,width_mm,height_mm,diameter_mm,die_models(control_number,description),die_order_lines(die_order_id,die_orders(po_date,due_date))")
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
      const loadedUnits = (unitResult.data ?? []) as unknown as Unit[];
      setUnits(loadedUnits);
      setSpecDrafts(Object.fromEntries(loadedUnits.map((unit) => [unit.id, {
        product_model: unit.product_model ?? "",
        die_shape: unit.die_shape ?? "",
        length_mm: unit.length_mm == null ? "" : String(unit.length_mm),
        width_mm: unit.width_mm == null ? "" : String(unit.width_mm),
        height_mm: unit.height_mm == null ? "" : String(unit.height_mm),
        diameter_mm: unit.diameter_mm == null ? "" : String(unit.diameter_mm),
      }])));
      setMachines((machineResult.data ?? []) as unknown as Machine[]);
      setAssignments((assignmentResult.data ?? []) as unknown as Assignment[]);
      setQcInspections((qcResult.data ?? []) as QCInspection[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Data Workcard gagal dimuat.");
    } finally {
      setLoading(false);
    }
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

  const repeatMatches = useMemo(() => {
    const result = new Map<string, {
      historicalUnitCount: number;
      averageMachineHours: number | null;
      latestControlNumber: string;
      latestPoDate: string | null;
    }>();
    for (const unit of units) {
      const currentOrderId = unit.die_order_lines?.die_order_id;
      if (!currentOrderId || !unit.product_model?.trim() || !unit.die_shape) continue;
      const candidates = units.filter((candidate) => {
        const candidateOrderId = candidate.die_order_lines?.die_order_id;
        if (!candidateOrderId || candidateOrderId === currentOrderId || !sameWorkcardSpecification(unit, candidate)) return false;
        const currentPoDate = unit.die_order_lines?.die_orders?.po_date;
        const candidatePoDate = candidate.die_order_lines?.die_orders?.po_date;
        if (currentPoDate && candidatePoDate && candidatePoDate > currentPoDate) return false;
        if (currentPoDate && candidatePoDate === currentPoDate && candidate.created_at >= unit.created_at) return false;
        return assignments.some((assignment) =>
          assignment.die_unit_id === candidate.id && assignment.released_at !== null &&
          new Date(assignment.released_at).getTime() > new Date(assignment.assigned_at).getTime()
        );
      });
      const completedDurations = candidates.map((candidate) => {
        const durations = assignments
          .filter((assignment) => assignment.die_unit_id === candidate.id && assignment.released_at)
          .map((assignment) => (new Date(assignment.released_at as string).getTime() - new Date(assignment.assigned_at).getTime()) / 3600000)
          .filter((hours) => Number.isFinite(hours) && hours > 0);
        return durations.reduce((sum, hours) => sum + hours, 0);
      }).filter((hours) => hours > 0);
      const latest = [...candidates].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      if (candidates.length > 0 && latest) {
        result.set(unit.id, {
          historicalUnitCount: candidates.length,
          averageMachineHours: completedDurations.length > 0
            ? completedDurations.reduce((sum, hours) => sum + hours, 0) / completedDurations.length
            : null,
          latestControlNumber: latest.die_models?.control_number ?? "—",
          latestPoDate: latest.die_order_lines?.die_orders?.po_date ?? null,
        });
      }
    }
    return result;
  }, [units, assignments]);

  const reportUnit = viewUnits.find((unit) => unit.id === reportUnitId) ?? viewUnits[0] ?? null;
  const reportHistory = reportUnit
    ? assignments
        .filter((item) => item.die_unit_id === reportUnit.id)
        .sort((a, b) => new Date(a.assigned_at).getTime() - new Date(b.assigned_at).getTime())
    : [];

  async function saveSpecifications(unit: Unit) {
    const draft = specDrafts[unit.id];
    if (!draft) return;
    const productModel = draft.product_model.trim();
    if (!productModel) {
      setError("Product / Model wajib diisi untuk menyimpan spesifikasi dies.");
      setNotice("");
      return;
    }
    if (!draft.die_shape) {
      setError("Pilih bentuk dies: Box atau Cylinder.");
      setNotice("");
      return;
    }
    const length = Number(draft.length_mm);
    const width = draft.width_mm === "" ? null : Number(draft.width_mm);
    const height = draft.height_mm === "" ? null : Number(draft.height_mm);
    const diameter = draft.diameter_mm === "" ? null : Number(draft.diameter_mm);
    const validPositive = (value: number | null) => value !== null && Number.isFinite(value) && value > 0;
    if (draft.die_shape === "box" && (!validPositive(length) || !validPositive(width) || !validPositive(height) || diameter !== null)) {
      setError("Bentuk Box wajib memiliki panjang, lebar, dan tinggi lebih dari 0 mm; diameter harus kosong.");
      setNotice("");
      return;
    }
    if (draft.die_shape === "cylinder" && (!validPositive(length) || !validPositive(diameter) || width !== null || height !== null)) {
      setError("Bentuk Cylinder wajib memiliki diameter dan panjang lebih dari 0 mm; lebar dan tinggi harus kosong.");
      setNotice("");
      return;
    }
    setSaving(unit.id);
    setError("");
    setNotice("");
    try {
      const db = createClient();
      const values = {
        product_model: productModel,
        die_shape: draft.die_shape,
        length_mm: length,
        width_mm: draft.die_shape === "box" ? width : null,
        height_mm: draft.die_shape === "box" ? height : null,
        diameter_mm: draft.die_shape === "cylinder" ? diameter : null,
      };
      const { error: updateError } = await db.from("die_units").update(values).eq("id", unit.id);
      if (updateError) throw updateError;
      setUnits((current) => current.map((item) => item.id === unit.id ? { ...item, ...values } : item));
      setNotice("Spesifikasi Workcard berhasil disimpan.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Spesifikasi Workcard gagal disimpan.");
    } finally {
      setSaving(null);
    }
  }

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
                  <div><h4>Spesifikasi Product / Model & Dies</h4><p>Identitas dan ukuran fisik untuk pencocokan repeat order</p></div>
                </div>
                {isAdmin ? (
                  <div className="production-fields">
                    <label>Product / Model
                      <input value={specDrafts[unit.id]?.product_model ?? ""} onChange={(event) => setSpecDrafts((current) => ({ ...current, [unit.id]: { ...(current[unit.id] ?? { product_model: "", die_shape: "", length_mm: "", width_mm: "", height_mm: "", diameter_mm: "" }), product_model: event.target.value } }))} placeholder="Masukkan Product / Model" />
                    </label>
                    <label>Bentuk dies
                      <select value={specDrafts[unit.id]?.die_shape ?? ""} onChange={(event) => setSpecDrafts((current) => ({ ...current, [unit.id]: { ...(current[unit.id] ?? { product_model: "", die_shape: "", length_mm: "", width_mm: "", height_mm: "", diameter_mm: "" }), die_shape: event.target.value as "" | "box" | "cylinder", width_mm: event.target.value === "cylinder" ? "" : current[unit.id]?.width_mm ?? "", height_mm: event.target.value === "cylinder" ? "" : current[unit.id]?.height_mm ?? "", diameter_mm: event.target.value === "box" ? "" : current[unit.id]?.diameter_mm ?? "" } }))}>
                        <option value="">Pilih bentuk</option><option value="box">Box</option><option value="cylinder">Cylinder</option>
                      </select>
                    </label>
                    <label>Panjang (mm)
                      <input type="number" min="0.01" step="0.01" value={specDrafts[unit.id]?.length_mm ?? ""} onChange={(event) => setSpecDrafts((current) => ({ ...current, [unit.id]: { ...(current[unit.id] ?? { product_model: "", die_shape: "", length_mm: "", width_mm: "", height_mm: "", diameter_mm: "" }), length_mm: event.target.value } }))} />
                    </label>
                    {specDrafts[unit.id]?.die_shape === "box" && <>
                      <label>Lebar (mm)<input type="number" min="0.01" step="0.01" value={specDrafts[unit.id]?.width_mm ?? ""} onChange={(event) => setSpecDrafts((current) => ({ ...current, [unit.id]: { ...current[unit.id], width_mm: event.target.value } }))} /></label>
                      <label>Tinggi (mm)<input type="number" min="0.01" step="0.01" value={specDrafts[unit.id]?.height_mm ?? ""} onChange={(event) => setSpecDrafts((current) => ({ ...current, [unit.id]: { ...current[unit.id], height_mm: event.target.value } }))} /></label>
                    </>}
                    {specDrafts[unit.id]?.die_shape === "cylinder" && <label>Diameter besar (mm)<input type="number" min="0.01" step="0.01" value={specDrafts[unit.id]?.diameter_mm ?? ""} onChange={(event) => setSpecDrafts((current) => ({ ...current, [unit.id]: { ...current[unit.id], diameter_mm: event.target.value } }))} /></label>}
                    <button type="button" disabled={saving === unit.id} onClick={() => void saveSpecifications(unit)}>{saving === unit.id ? "Menyimpan..." : "Simpan spesifikasi"}</button>
                  </div>
                ) : (
                  <p>{unit.product_model || "Product / Model belum diisi"} · {unit.die_shape === "box" ? `Box · ${unit.length_mm} × ${unit.width_mm} × ${unit.height_mm} mm` : unit.die_shape === "cylinder" ? `Cylinder · Ø${unit.diameter_mm} × ${unit.length_mm} mm` : "Ukuran dies belum diisi"}</p>
                )}
              </article>
              <article className="production-process-card">
                <div className="production-process-title">
                  <div><h4>Pencocokan Repeat Order</h4><p>Product/Model, bentuk dies, dan seluruh dimensi harus identik; pencocokan memakai riwayat dari order sebelumnya, bukan nomor PO.</p></div>
                  {repeatMatches.has(unit.id) ? (
                    <span className="production-status production-status-completed">REPEAT ORDER</span>
                  ) : (
                    <span className="production-status production-status-pending">NEW ORDER</span>
                  )}
                </div>
                {repeatMatches.has(unit.id) ? (
                  <div>
                    <p>Spesifikasi cocok dengan {repeatMatches.get(unit.id)?.historicalUnitCount} unit dies dari PO sebelumnya.</p>
                    <p>Referensi terakhir: Control Number <strong>{repeatMatches.get(unit.id)?.latestControlNumber}</strong>
                      {repeatMatches.get(unit.id)?.latestPoDate ? ` · PO ${repeatMatches.get(unit.id)?.latestPoDate}` : ""}.</p>
                    <p><strong>Rata-rata durasi kerja mesin:</strong> {repeatMatches.get(unit.id)?.averageMachineHours == null
                      ? "Belum tersedia dari riwayat mesin yang selesai."
                      : formatDuration(repeatMatches.get(unit.id)?.averageMachineHours ?? 0)}.</p>
                    <p className="hero-copy">Estimasi ini hanya memakai total durasi penugasan mesin yang sudah selesai pada unit referensi, bukan total lead time seluruh proses produksi.</p>
                  </div>
                ) : (
                  <p>Belum ditemukan riwayat produksi terdahulu dengan spesifikasi yang sama persis. Unit dikategorikan sebagai New Order.</p>
                )}
              </article>
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
