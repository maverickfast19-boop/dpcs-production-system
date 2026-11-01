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
type Result = "good" | "reject";
type Inspection = {
  id: string;
  die_unit_id: string;
  result: Result;
  inspector_name: string;
  findings: string | null;
  notes: string | null;
  head_decision: "repair" | "scrap" | null;
  decision_by: string | null;
  decision_notes: string | null;
  decision_at: string | null;
  created_at: string;
};
type Draft = { result: Result; inspector_name: string; findings: string; notes: string };
type ReinspectionOrder = {
  id: string;
  die_unit_id: string;
  qc_inspection_id: string;
  completed_at: string | null;
  reinspection_qc_inspection_id: string | null;
};

const emptyDraft = (): Draft => ({
  result: "good",
  inspector_name: "",
  findings: "",
  notes: "",
});

function formatDate(value: string) {
  return new Date(value).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function QualityManager() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [reinspectionOrders, setReinspectionOrders] = useState<ReinspectionOrder[]>([]);
  const [selectedRepairOrderId, setSelectedRepairOrderId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isHeadOfProduction, setIsHeadOfProduction] = useState(false);
  const [roleStatus, setRoleStatus] = useState<"checking" | "head" | "operator" | "error">("checking");
  const [decisionSaving, setDecisionSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const db = createClient();
      const [unitResult, modelResult, inspectionResult, repairResult] = await Promise.all([
        db.from("die_units")
          .select("id,die_model_id,unit_sequence,physical_unit_code,status")
          .order("created_at", { ascending: false }),
        db.from("die_models")
          .select("id,control_number,description")
          .order("control_number"),
        db.from("die_unit_qc_inspections")
          .select("id,die_unit_id,result,inspector_name,findings,notes,head_decision,decision_by,decision_notes,decision_at,created_at")
          .order("created_at", { ascending: false }),
        db.from("die_unit_repair_work_orders")
          .select("id,die_unit_id,qc_inspection_id,completed_at,reinspection_qc_inspection_id")
          .eq("status", "completed")
          .is("reinspection_qc_inspection_id", null)
          .order("completed_at", { ascending: false }),
      ]);
      const failed = [unitResult, modelResult, inspectionResult, repairResult].find((item) => item.error);
      if (failed?.error) throw failed.error;
      setUnits((unitResult.data ?? []) as Unit[]);
      setModels((modelResult.data ?? []) as Model[]);
      setInspections((inspectionResult.data ?? []) as Inspection[]);
      setReinspectionOrders((repairResult.data ?? []) as ReinspectionOrder[]);
      const roleResult = await db.rpc("is_head_of_production");
      if (roleResult.error) {
        setIsHeadOfProduction(false);
        setRoleStatus("error");
      } else {
        const isHead = roleResult.data === true;
        setIsHeadOfProduction(isHead);
        setRoleStatus(isHead ? "head" : "operator");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Data Quality Control gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const modelMap = useMemo(
    () => new Map(models.map((model) => [model.id, model])),
    [models],
  );
  const historyByUnit = useMemo(() => {
    const grouped: Record<string, Inspection[]> = {};
    for (const inspection of inspections) {
      (grouped[inspection.die_unit_id] ??= []).push(inspection);
    }
    return grouped;
  }, [inspections]);

  const visibleUnits = useMemo(() => {
    const query = search.trim().toLowerCase();
    return units.filter((unit) => {
      const model = modelMap.get(unit.die_model_id);
      return !query || [
        model?.control_number ?? "",
        model?.description ?? "",
        unit.physical_unit_code ?? "",
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [units, modelMap, search]);

  const rejectedInspections = inspections.filter((item) => item.result === "reject");
  const goodCount = inspections.filter((item) => item.result === "good").length;

  function updateDraft(unitId: string, patch: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [unitId]: { ...(current[unitId] ?? emptyDraft()), ...patch },
    }));
  }

  async function saveInspection(unit: Unit, repairOrderId?: string) {
    const draft = drafts[unit.id] ?? emptyDraft();
    if (!draft.inspector_name.trim()) {
      setError("Nama operator QC wajib diisi.");
      setNotice("");
      return;
    }
    if (draft.result === "reject" && !draft.findings.trim()) {
      setError("Untuk hasil REJECT, temuan atau alasan reject wajib diisi.");
      setNotice("");
      return;
    }

    setSaving(unit.id);
    setError("");
    setNotice("");
    try {
      const db = createClient();
      const { data: savedInspection, error: saveError } = await db.from("die_unit_qc_inspections").insert({
        die_unit_id: unit.id,
        result: draft.result,
        inspector_name: draft.inspector_name.trim(),
        findings: draft.findings.trim() || null,
        notes: draft.notes.trim() || null,
      }).select("id").single();
      if (saveError) throw saveError;
      if (repairOrderId) {
        const { error: queueError } = await db.from("die_unit_repair_work_orders")
          .update({ reinspection_qc_inspection_id: savedInspection.id, updated_at: new Date().toISOString() })
          .eq("id", repairOrderId)
          .eq("die_unit_id", unit.id)
          .is("reinspection_qc_inspection_id", null);
        if (queueError) throw queueError;
      }
      setSelectedRepairOrderId(null);
      setDrafts((current) => ({ ...current, [unit.id]: emptyDraft() }));
      setNotice(
        repairOrderId
          ? `Hasil QC ulang berhasil dicatat sebagai ${draft.result.toUpperCase()}. Riwayat perbaikan ini telah ditutup dari antrean QC ulang.`
          : draft.result === "reject"
            ? "Hasil REJECT berhasil dicatat. Notifikasi prioritas tinggi muncul untuk menunggu keputusan Kepala Produksi."
            : "Hasil QC GOOD berhasil dicatat.",
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hasil QC gagal disimpan.");
    } finally {
      setSaving(null);
    }
  }

  async function saveDisposition(inspection: Inspection, decision: "repair" | "scrap") {
    setDecisionSaving(inspection.id);
    setError("");
    setNotice("");
    try {
      const db = createClient();
      const { error: decisionError } = await db.rpc("record_qc_disposition", {
        p_inspection_id: inspection.id,
        p_decision: decision,
        p_notes: null,
      });
      if (decisionError) throw decisionError;
      setNotice(`Keputusan ${decision.toUpperCase()} berhasil disimpan.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Keputusan QC gagal disimpan.");
    } finally {
      setDecisionSaving(null);
    }
  }

  return (
    <main className="page-shell order-page qc-page">
      <header className="topbar">
        <Link className="back-link" href="/">← DPCS</Link>
        <div className="topbar-copy">
          <p className="eyebrow">MODUL 04</p>
          <h1>Quality Control</h1>
        </div>
        <span className="environment">QC PER UNIT</span>
      </header>

      <section className="order-intro">
        <p className="eyebrow">PEMERIKSAAN HASIL SETIAP UNIT FISIK DIES</p>
        <h2>Mutu setiap unit harus terbukti.</h2>
        <p className="hero-copy">
          Setiap pemeriksaan disimpan sebagai riwayat tersendiri berdasarkan unit fisik.
          Pemeriksaan ulang tidak menimpa hasil sebelumnya.
        </p>
      </section>

      <div className="notice notice-info" role="status">
        {roleStatus === "checking"
          ? "Sedang memeriksa hak akses akun..."
          : roleStatus === "head"
            ? "Akses Kepala Produksi aktif — akun ini berwenang memutuskan REPAIR atau SCRAP untuk hasil QC REJECT."
            : roleStatus === "operator"
              ? "Akses operator QC — keputusan REPAIR atau SCRAP hanya dapat dilakukan oleh Kepala Produksi."
              : "Hak akses belum dapat diverifikasi. Periksa koneksi lalu tekan Muat ulang."}
      </div>

      <section className="qc-summary">
        <article><span>Total unit dies</span><strong>{units.length}</strong></article>
        <article><span>QC GOOD</span><strong>{goodCount}</strong></article>
        <article><span>QC REJECT</span><strong>{rejectedInspections.length}</strong></article>
      </section>

      {rejectedInspections.length > 0 && (
        <section className="qc-alert-panel" aria-live="polite">
          <div className="qc-alert-heading">
            <span className="qc-alert-mark">!</span>
            <div>
              <p className="eyebrow">PRIORITAS TINGGI</p>
              <h3>Pemantauan hasil QC REJECT dan keputusan Kepala Produksi</h3>
            </div>
            <strong>{rejectedInspections.length}</strong>
          </div>
          <div className="qc-alert-list">
            {rejectedInspections.map((inspection) => {
              const unit = units.find((item) => item.id === inspection.die_unit_id);
              const model = unit ? modelMap.get(unit.die_model_id) : undefined;
              return (
                <article className="qc-alert-item" key={inspection.id}>
                  <div>
                    <strong>Control Number: {model?.control_number ?? "—"}</strong>
                    <span>Unit: {unit?.physical_unit_code || (unit ? `Unit #${unit.unit_sequence}` : "Unit tidak ditemukan")}</span>
                    <span>Hasil: REJECT · Operator QC: {inspection.inspector_name}</span>
                    <span>Waktu: {formatDate(inspection.created_at)}</span>
                    {inspection.findings && <span>Temuan: {inspection.findings}</span>}
                  </div>
                  {inspection.head_decision ? (
                    <em>Keputusan: {inspection.head_decision.toUpperCase()} · {inspection.decision_by ?? "Kepala Produksi"}</em>
                  ) : isHeadOfProduction ? (
                    <div className="qc-decision-actions">
                      <strong>Keputusan Kepala Produksi</strong>
                      <button type="button" disabled={decisionSaving === inspection.id} onClick={() => void saveDisposition(inspection, "repair")}>
                        {decisionSaving === inspection.id ? "Menyimpan..." : "REPAIR"}
                      </button>
                      <button type="button" disabled={decisionSaving === inspection.id} onClick={() => void saveDisposition(inspection, "scrap")}>
                        {decisionSaving === inspection.id ? "Menyimpan..." : "SCRAP"}
                      </button>
                    </div>
                  ) : (
                    <em>Menunggu keputusan Kepala Produksi</em>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {reinspectionOrders.length > 0 && (
        <section className="qc-alert-panel" aria-live="polite">
          <div className="qc-alert-heading">
            <span className="qc-alert-mark">↻</span>
            <div>
              <p className="eyebrow">ANTREAN QC ULANG</p>
              <h3>Unit selesai diperbaiki dan menunggu pemeriksaan ulang</h3>
            </div>
            <strong>{reinspectionOrders.length}</strong>
          </div>
          <div className="qc-alert-list">
            {reinspectionOrders.map((order) => {
              const unit = units.find((item) => item.id === order.die_unit_id);
              const model = unit ? modelMap.get(unit.die_model_id) : undefined;
              return (
                <article className="qc-alert-item" key={order.id}>
                  <div>
                    <strong>Control Number: {model?.control_number ?? "—"}</strong>
                    <span>Unit: {unit?.physical_unit_code || (unit ? `Unit #${unit.unit_sequence}` : "Unit tidak ditemukan")}</span>
                    <span>Perbaikan selesai: {order.completed_at ? formatDate(order.completed_at) : "Waktu belum tersedia"}</span>
                    <em>Menunggu QC ulang</em>
                  </div>
                  <button type="button" disabled={!unit} onClick={() => {
                    setSelectedRepairOrderId(order.id);
                    document.getElementById(`qc-unit-${order.die_unit_id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}>Periksa ulang</button>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <div className="production-toolbar">
        <input
          aria-label="Cari unit dies"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cari Control Number atau marking fisik..."
        />
        <button type="button" onClick={() => void load()} disabled={loading}>Muat ulang</button>
      </div>

      {notice && <div className="notice notice-info">{notice}</div>}
      {error && <div className="notice notice-warning">{error}</div>}

      {loading ? (
        <div className="dashboard-message">Memuat data QC dari database...</div>
      ) : visibleUnits.length === 0 ? (
        <div className="dashboard-message">Belum ada unit dies. Periksa data pada Modul 02 terlebih dahulu.</div>
      ) : visibleUnits.map((unit) => {
        const model = modelMap.get(unit.die_model_id);
        const unitLabel = unit.physical_unit_code || `Unit #${unit.unit_sequence} (belum diberi marking)`;
        const draft = drafts[unit.id] ?? emptyDraft();
        const history = historyByUnit[unit.id] ?? [];
        return (
          <section className="qc-unit-panel" id={`qc-unit-${unit.id}`} key={unit.id}>
            <div className="qc-unit-heading">
              <div>
                <p className="eyebrow">CONTROL NUMBER · {model?.control_number ?? "—"}</p>
                <h3>{unitLabel}</h3>
                <p>{model?.description ?? "Deskripsi dies tidak tersedia"}</p>
              </div>
              <span>{history.length} pemeriksaan</span>
            </div>

            <div className="qc-entry-card">
              <h4>{selectedRepairOrderId && reinspectionOrders.some((item) => item.id === selectedRepairOrderId && item.die_unit_id === unit.id) ? "Catat hasil QC ulang setelah perbaikan" : "Catat hasil pemeriksaan baru"}</h4>
              <div className="qc-fields">
                <label>Operator QC
                  <input
                    value={draft.inspector_name}
                    onChange={(event) => updateDraft(unit.id, { inspector_name: event.target.value })}
                    placeholder="Nama pemeriksa QC"
                  />
                </label>
                <label>Hasil pemeriksaan
                  <select
                    value={draft.result}
                    onChange={(event) => updateDraft(unit.id, { result: event.target.value as Result })}
                  >
                    <option value="good">GOOD</option>
                    <option value="reject">REJECT</option>
                  </select>
                </label>
                <label className="qc-wide">Temuan / alasan REJECT
                  <textarea
                    value={draft.findings}
                    onChange={(event) => updateDraft(unit.id, { findings: event.target.value })}
                    placeholder="Tuliskan temuan dimensi, fungsi, visual, atau alasan reject..."
                    rows={2}
                  />
                </label>
                <label className="qc-wide">Catatan pemeriksaan
                  <textarea
                    value={draft.notes}
                    onChange={(event) => updateDraft(unit.id, { notes: event.target.value })}
                    placeholder="Catatan tambahan pemeriksa..."
                    rows={2}
                  />
                </label>
              </div>
              <button
                className="qc-save-button"
                type="button"
                disabled={saving === unit.id}
                onClick={() => void saveInspection(unit, selectedRepairOrderId && reinspectionOrders.some((item) => item.id === selectedRepairOrderId && item.die_unit_id === unit.id) ? selectedRepairOrderId : undefined)}
              >
                {saving === unit.id ? "Menyimpan..." : selectedRepairOrderId && reinspectionOrders.some((item) => item.id === selectedRepairOrderId && item.die_unit_id === unit.id) ? "Simpan hasil QC ulang" : "Simpan hasil QC"}
              </button>
            </div>

            <div className="qc-history">
              <h4>Riwayat QC unit ini</h4>
              {history.length === 0 ? (
                <p className="dashboard-empty">Belum ada pemeriksaan QC yang tercatat.</p>
              ) : history.map((inspection, index) => (
                <article className="qc-history-row" key={inspection.id}>
                  <div className="qc-history-title">
                    <strong>Pemeriksaan #{history.length - index}</strong>
                    <span className={inspection.result === "good" ? "qc-result-good" : "qc-result-reject"}>
                      {inspection.result.toUpperCase()}
                    </span>
                  </div>
                  <p>Operator: {inspection.inspector_name} · {formatDate(inspection.created_at)}</p>
                  {inspection.findings && <p>Temuan: {inspection.findings}</p>}
                  {inspection.notes && <p>Catatan: {inspection.notes}</p>}
                  {inspection.result === "reject" && (
                    <small className="qc-pending-decision">
                      {inspection.head_decision
                        ? `Keputusan Kepala Produksi: ${inspection.head_decision.toUpperCase()}${inspection.decision_by ? ` oleh ${inspection.decision_by}` : ""}`
                        : "Menunggu keputusan Kepala Produksi: REPAIR atau SCRAP"}
                    </small>
                  )}
                </article>
              ))}
            </div>
          </section>
        );
      })}

      <footer className="footer">
        <span>DPCS · Dies Production Control System</span>
        <Link href="/">Kembali ke dashboard</Link>
      </footer>
    </main>
  );
}
