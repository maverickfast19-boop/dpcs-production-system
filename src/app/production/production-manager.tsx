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
};
type Model = { id: string; control_number: string; description: string };
type StepStatus = "pending" | "in_progress" | "completed" | "hold";
type ProcessCode = "machining" | "assembly" | "fitting" | "trial" | "qc";
type Step = {
  id?: string;
  die_unit_id: string;
  process_code: ProcessCode;
  status: StepStatus;
  operator_name: string;
  machine_name: string;
  notes: string;
  started_at?: string | null;
  completed_at?: string | null;
};
const processes: { code: ProcessCode; label: string; detail: string }[] = [
  { code: "machining", label: "Machining", detail: "Pengerjaan komponen dan proses pemesinan" },
  { code: "assembly", label: "Assembly", detail: "Perakitan komponen dies" },
  { code: "fitting", label: "Fitting", detail: "Penyesuaian dan pemeriksaan kesesuaian" },
  { code: "trial", label: "Trial", detail: "Uji coba fungsi dies" },
];
const statusLabels: Record<StepStatus, string> = {
  pending: "Belum dimulai",
  in_progress: "Sedang dikerjakan",
  completed: "Selesai",
  hold: "HOLD",
};

function emptyStep(unitId: string, process: ProcessCode): Step {
  return { die_unit_id: unitId, process_code: process, status: "pending", operator_name: "", machine_name: "", notes: "" };
}

function dateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

export default function ProductionManager() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [steps, setSteps] = useState<Record<string, Step>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const db = createClient();
      const [unitResult, modelResult, stepResult] = await Promise.all([
        db.from("die_units").select("id,die_model_id,unit_sequence,physical_unit_code,status").order("created_at", { ascending: false }),
        db.from("die_models").select("id,control_number,description").order("control_number"),
        db.from("die_unit_process_steps").select("id,die_unit_id,process_code,status,operator_name,machine_name,notes,started_at,completed_at"),
      ]);
      const failed = [unitResult, modelResult, stepResult].find((result) => result.error);
      if (failed?.error) throw failed.error;
      const loadedUnits = (unitResult.data ?? []) as Unit[];
      const loadedModels = (modelResult.data ?? []) as Model[];
      const loadedSteps = (stepResult.data ?? []) as Step[];
      const byUnitAndProcess: Record<string, Step> = {};
      for (const unit of loadedUnits) {
        for (const process of processes) byUnitAndProcess[`${unit.id}:${process.code}`] = emptyStep(unit.id, process.code);
      }
      for (const step of loadedSteps) byUnitAndProcess[`${step.die_unit_id}:${step.process_code}`] = {
        ...emptyStep(step.die_unit_id, step.process_code),
        ...step,
        operator_name: step.operator_name ?? "",
        machine_name: step.machine_name ?? "",
        notes: step.notes ?? "",
      };
      setUnits(loadedUnits);
      setModels(loadedModels);
      setSteps(byUnitAndProcess);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Data monitoring produksi gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const modelMap = useMemo(() => new Map(models.map((model) => [model.id, model])), [models]);
  const visibleUnits = useMemo(() => {
    const q = search.trim().toLowerCase();
    return units.filter((unit) => {
      const model = modelMap.get(unit.die_model_id);
      return !q || [model?.control_number ?? "", model?.description ?? "", unit.physical_unit_code ?? ""]
        .some((value) => value.toLowerCase().includes(q));
    });
  }, [units, modelMap, search]);

  function updateStep(key: string, patch: Partial<Step>) {
    setSteps((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  }

  async function saveStep(unit: Unit, process: ProcessCode) {
    const key = `${unit.id}:${process}`;
    const current = steps[key] ?? emptyStep(unit.id, process);
    setSaving(key);
    setNotice("");
    setError("");
    const now = new Date().toISOString();
    const payload = {
      die_unit_id: unit.id,
      process_code: process,
      status: current.status,
      operator_name: current.operator_name.trim() || null,
      machine_name: current.machine_name.trim() || null,
      notes: current.notes.trim() || null,
      started_at: current.status === "pending" ? null : (current.started_at || now),
      completed_at: current.status === "completed" ? (current.completed_at || now) : null,
      updated_at: now,
    };
    try {
      const db = createClient();
      const { data, error: saveError } = await db.from("die_unit_process_steps")
        .upsert(payload, { onConflict: "die_unit_id,process_code" })
        .select("id,die_unit_id,process_code,status,operator_name,machine_name,notes,started_at,completed_at")
        .single();
      if (saveError) throw saveError;
      setSteps((currentSteps) => ({
        ...currentSteps,
        [key]: { ...current, ...data, operator_name: data.operator_name ?? "", machine_name: data.machine_name ?? "", notes: data.notes ?? "" },
      }));
      setNotice(`Proses ${processes.find((item) => item.code === process)?.label} untuk ${unit.physical_unit_code || `unit #${unit.unit_sequence}`} berhasil disimpan.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Perubahan proses gagal disimpan.");
    } finally {
      setSaving(null);
    }
  }

  const completedCount = Object.values(steps).filter((step) => step.status === "completed").length;
  const holdCount = Object.values(steps).filter((step) => step.status === "hold").length;

  return (
    <main className="page-shell order-page production-page">
      <header className="topbar">
        <Link className="back-link" href="/">← DPCS</Link>
        <div className="topbar-copy"><p className="eyebrow">MODUL 03</p><h1>Production Monitoring</h1></div>
        <span className="environment">WORKCARD</span>
      </header>
      <section className="order-intro">
        <p className="eyebrow">PEMANTAUAN PROSES PER UNIT DIES</p>
        <h2>Setiap unit, setiap proses, tercatat.</h2>
        <p className="hero-copy">Catat pelaksana, mesin, status, dan catatan proses untuk setiap unit fisik. Perubahan pada satu unit tidak mengubah unit lain yang memiliki Control Number sama.</p>
      </section>
      <section className="production-summary">
        <article><span>Total unit</span><strong>{units.length}</strong></article>
        <article><span>Proses selesai</span><strong>{completedCount}</strong></article>
        <article><span>Proses HOLD</span><strong>{holdCount}</strong></article>
      </section>
      <div className="production-toolbar">
        <input aria-label="Cari unit dies" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari Control Number atau marking fisik..." />
        <button type="button" onClick={() => void load()} disabled={loading}>Muat ulang</button>
      </div>
      {notice && <div className="notice notice-info">{notice}</div>}
      {error && <div className="notice notice-warning">{error}</div>}
      {loading ? <div className="dashboard-message">Memuat Workcard dari database...</div> :
        visibleUnits.length === 0 ? <div className="dashboard-message">Belum ada unit dies. Impor order dan periksa Modul 02 terlebih dahulu.</div> :
        visibleUnits.map((unit) => {
          const model = modelMap.get(unit.die_model_id);
          const unitLabel = unit.physical_unit_code || `Unit #${unit.unit_sequence} (belum diberi marking)`;
          return (
            <section className="production-unit-panel" key={unit.id}>
              <div className="production-unit-heading">
                <div><p className="eyebrow">CONTROL NUMBER · {model?.control_number ?? "—"}</p><h3>{unitLabel}</h3><p>{model?.description ?? "Deskripsi dies tidak tersedia"}</p></div>
                <span>{unit.status.replaceAll("_", " ")}</span>
              </div>
              <div className="production-process-list">
                {processes.map((process, index) => {
                  const key = `${unit.id}:${process.code}`;
                  const step = steps[key] ?? emptyStep(unit.id, process.code);
                  return (
                    <article className="production-process-card" key={key}>
                      <div className="production-process-title">
                        <span className="production-process-number">{String(index + 1).padStart(2, "0")}</span>
                        <div><h4>{process.label}</h4><p>{process.detail}</p></div>
                        <span className={`production-status production-status-${step.status}`}>{statusLabels[step.status]}</span>
                      </div>
                      <div className="production-fields">
                        <label>Operator<input value={step.operator_name} onChange={(event) => updateStep(key, { operator_name: event.target.value })} placeholder="Nama operator" /></label>
                        <label>Mesin / area<input value={step.machine_name} onChange={(event) => updateStep(key, { machine_name: event.target.value })} placeholder="Nama mesin atau area" /></label>
                        <label>Status<select value={step.status} onChange={(event) => updateStep(key, { status: event.target.value as StepStatus })}>
                          <option value="pending">Belum dimulai</option><option value="in_progress">Sedang dikerjakan</option><option value="completed">Selesai</option><option value="hold">HOLD</option>
                        </select></label>
                        <label className="production-notes">Catatan<textarea value={step.notes} onChange={(event) => updateStep(key, { notes: event.target.value })} placeholder="Catatan pekerjaan, kendala, atau hasil proses..." rows={2} /></label>
                      </div>
                      <div className="production-process-footer">
                        <small>Mulai: {dateTime(step.started_at)} · Selesai: {dateTime(step.completed_at)}</small>
                        <button type="button" disabled={saving === key} onClick={() => void saveStep(unit, process.code)}>{saving === key ? "Menyimpan..." : "Simpan proses"}</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      <footer className="footer"><span>DPCS · Dies Production Control System</span><Link href="/">Kembali ke dashboard</Link></footer>
    </main>
  );
}
