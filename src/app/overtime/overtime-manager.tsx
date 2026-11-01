"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Machine = { id: string; machine_code: string };
type OvertimeRequest = {
  id: string;
  overtime_start: string;
  overtime_end: string;
  scope: "factory" | "machine";
  machine_id: string | null;
  reason: string;
  status: "pending" | "approved" | "rejected";
  review_notes: string | null;
  created_at: string;
};

function localInputToIso(value: string) {
  return new Date(value).toISOString();
}
function showDate(value: string) {
  return new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}
function inputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export default function OvertimeManager() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [requests, setRequests] = useState<OvertimeRequest[]>([]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [scope, setScope] = useState<"factory" | "machine">("factory");
  const [machineId, setMachineId] = useState("");
  const [reason, setReason] = useState("");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [isHead, setIsHead] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const db = createClient();
      const [machineResult, requestResult, roleResult] = await Promise.all([
        db.from("dpcs_machines").select("id,machine_code").order("machine_code"),
        db.from("dpcs_overtime_requests").select("id,overtime_start,overtime_end,scope,machine_id,reason,status,review_notes,created_at").order("created_at", { ascending: false }),
        db.rpc("is_head_of_production"),
      ]);
      const failed = [machineResult, requestResult].find((item) => item.error);
      if (failed?.error) throw failed.error;
      setMachines((machineResult.data ?? []) as Machine[]);
      setRequests((requestResult.data ?? []) as OvertimeRequest[]);
      setIsHead(roleResult.data === true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Data overtime gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const now = new Date();
    const later = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    setStart(inputValue(now));
    setEnd(inputValue(later));
    void load();
  }, [load]);

  const machineMap = useMemo(() => new Map(machines.map((item) => [item.id, item.machine_code])), [machines]);
  const counts = useMemo(() => ({
    pending: requests.filter((item) => item.status === "pending").length,
    approved: requests.filter((item) => item.status === "approved").length,
    rejected: requests.filter((item) => item.status === "rejected").length,
  }), [requests]);

  async function submitRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving("new");
    setNotice("");
    setError("");
    try {
      if (scope === "machine" && !machineId) throw new Error("Pilih mesin untuk pengajuan overtime khusus mesin.");
      const startAt = new Date(start);
      const endAt = new Date(end);
      if (!start || !end || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
        throw new Error("Waktu selesai harus lebih akhir daripada waktu mulai.");
      }
      const db = createClient();
      const { error: insertError } = await db.from("dpcs_overtime_requests").insert({
        overtime_start: localInputToIso(start),
        overtime_end: localInputToIso(end),
        scope,
        machine_id: scope === "machine" ? machineId : null,
        reason: reason.trim(),
      });
      if (insertError) throw insertError;
      setReason("");
      setNotice("Pengajuan overtime berhasil dikirim dan menunggu persetujuan Kepala Produksi.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pengajuan overtime gagal disimpan.");
    } finally {
      setSaving(null);
    }
  }

  async function review(item: OvertimeRequest, decision: "approved" | "rejected") {
    setSaving(item.id);
    setNotice("");
    setError("");
    try {
      const db = createClient();
      const { error: reviewError } = await db.rpc("dpcs_review_overtime_request", {
        p_request_id: item.id,
        p_decision: decision,
        p_review_notes: reviewNotes[item.id] ?? "",
      });
      if (reviewError) throw reviewError;
      setNotice(decision === "approved" ? "Overtime berhasil disetujui." : "Pengajuan overtime ditolak.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Keputusan overtime gagal disimpan.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <main className="page-shell order-page production-page">
      <header className="topbar">
        <Link className="back-link" href="/">← DPCS</Link>
        <div className="topbar-copy"><p className="eyebrow">MODUL 08</p><h1>Shift & Overtime Planning</h1></div>
        <span className="environment">KAPASITAS KERJA</span>
      </header>

      <section className="order-intro">
        <p className="eyebrow">KALENDER KAPASITAS PRODUKSI</p>
        <h2>Kapasitas kerja berdasarkan jadwal resmi pabrik.</h2>
        <p className="hero-copy">
          Jadwal normal berlaku Senin–Jumat. Shift 1 pukul 07.30–16.30 dan Shift 2 pukul
          20.00–05.00 hari berikutnya, masing-masing dengan istirahat 1 jam.
        </p>
      </section>

      <section className="qc-summary">
        <article><span>Jam efektif / shift</span><strong>8 jam</strong></article>
        <article><span>Jam efektif / mesin / hari</span><strong>16 jam</strong></article>
        <article><span>Kapasitas seluruh 27 mesin / hari</span><strong>432 jam-mesin</strong></article>
        <article><span>Hari kerja normal</span><strong>Senin–Jumat</strong></article>
      </section>

      <div className="notice notice-info">
        Sabtu dan Minggu adalah hari libur normal. Overtime hanya dihitung sebagai kapasitas tambahan
        setelah disetujui Kepala Produksi. Angka kapasitas di atas adalah kapasitas teoritis berdasarkan
        seluruh 27 mesin beroperasi pada kedua shift, bukan jaminan output aktual.
      </div>

      <section className="order-intro">
        <p className="eyebrow">PENGAJUAN TAMBAHAN JAM KERJA</p>
        <h2>Ajukan overtime untuk disetujui.</h2>
        <p className="hero-copy">Pengajuan dapat mencakup seluruh pabrik atau satu mesin tertentu. Overtime berstatus menunggu belum menambah kapasitas terencana.</p>
      </section>

      <form className="qc-unit-panel" onSubmit={submitRequest}>
        <div className="qc-fields">
          <label>Mulai overtime
            <input type="datetime-local" required value={start} onChange={(event) => setStart(event.target.value)} />
          </label>
          <label>Selesai overtime
            <input type="datetime-local" required value={end} onChange={(event) => setEnd(event.target.value)} />
          </label>
          <label>Lingkup overtime
            <select value={scope} onChange={(event) => setScope(event.target.value as "factory" | "machine")}>
              <option value="factory">Seluruh pabrik</option>
              <option value="machine">Mesin tertentu</option>
            </select>
          </label>
          {scope === "machine" && <label>Pilih mesin
            <select required value={machineId} onChange={(event) => setMachineId(event.target.value)}>
              <option value="">Pilih mesin</option>
              {machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.machine_code}</option>)}
            </select>
          </label>}
          <label className="production-notes">Alasan / kebutuhan overtime
            <textarea required minLength={5} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Contoh: mengejar target penyelesaian dies..." />
          </label>
        </div>
        <button type="submit" disabled={saving === "new"}>{saving === "new" ? "Mengirim..." : "Kirim pengajuan overtime"}</button>
      </form>

      {notice && <div className="notice notice-info">{notice}</div>}
      {error && <div className="notice notice-warning">{error}</div>}

      <section className="qc-summary">
        <article><span>Menunggu persetujuan</span><strong>{counts.pending}</strong></article>
        <article><span>Disetujui</span><strong>{counts.approved}</strong></article>
        <article><span>Ditolak</span><strong>{counts.rejected}</strong></article>
      </section>

      <div className="production-toolbar">
        <strong>Daftar pengajuan overtime</strong>
        <button type="button" onClick={() => void load()} disabled={loading}>Muat ulang</button>
      </div>
      {loading ? <div className="dashboard-message">Memuat pengajuan overtime...</div> :
        requests.length === 0 ? <div className="dashboard-message">Belum ada pengajuan overtime.</div> :
        <section className="qc-unit-panel"><div className="qc-history">
          {requests.map((item) => (
            <article className="qc-history-row" key={item.id}>
              <div className="qc-history-title">
                <strong>{item.scope === "factory" ? "Seluruh pabrik" : machineMap.get(item.machine_id ?? "") ?? "Mesin"}</strong>
                <span>{item.status === "pending" ? "Menunggu persetujuan" : item.status === "approved" ? "Disetujui" : "Ditolak"}</span>
              </div>
              <p><strong>Mulai:</strong> {showDate(item.overtime_start)}</p>
              <p><strong>Selesai:</strong> {showDate(item.overtime_end)}</p>
              <p><strong>Alasan:</strong> {item.reason}</p>
              {item.review_notes && <p><strong>Catatan Kepala Produksi:</strong> {item.review_notes}</p>}
              {isHead && item.status === "pending" && <>
                <label>Catatan keputusan
                  <textarea rows={2} value={reviewNotes[item.id] ?? ""} onChange={(event) => setReviewNotes((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Opsional" />
                </label>
                <div className="production-process-footer">
                  <button type="button" disabled={saving === item.id} onClick={() => void review(item, "approved")}>Setujui overtime</button>
                  <button type="button" disabled={saving === item.id} onClick={() => void review(item, "rejected")}>Tolak</button>
                </div>
              </>}
            </article>
          ))}
        </div></section>}

      <footer className="footer"><span>DPCS · Dies Production Control System</span><Link href="/">Kembali ke dashboard</Link></footer>
    </main>
  );
}
