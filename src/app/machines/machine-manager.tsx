"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type MachineType = {
  id: string;
  machine_type: string;
  machine_count: number;
  process_group: string;
  notes: string | null;
  is_active: boolean;
};

type Machine = {
  id: string;
  machine_code: string;
  machine_status: "unverified" | "available" | "in_use" | "maintenance" | "inactive";
  machine_type_id: string;
  dpcs_machine_types: { machine_type: string } | null;
};

type Assignment = {
  id: string;
  machine_id: string;
  die_unit_id: string;
  process_code: string;
  assigned_at: string;
};

const statusLabels: Record<Machine["machine_status"], string> = {
  unverified: "Belum diverifikasi",
  available: "Tersedia",
  in_use: "Sedang digunakan",
  maintenance: "Maintenance",
  inactive: "Tidak aktif",
};

function number(value: number) {
  return new Intl.NumberFormat("id-ID").format(value);
}

function dateTime(value: string) {
  return new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

export default function MachineManager() {
  const [items, setItems] = useState<MachineType[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const db = createClient();
      const [typeResult, machineResult, assignmentResult] = await Promise.all([
        db.from("dpcs_machine_types")
          .select("id,machine_type,machine_count,process_group,notes,is_active")
          .order("machine_type"),
        db.from("dpcs_machines")
          .select("id,machine_code,machine_status,machine_type_id,dpcs_machine_types(machine_type)")
          .order("machine_code"),
        db.from("dpcs_machine_assignments")
          .select("id,machine_id,die_unit_id,process_code,assigned_at")
          .is("released_at", null),
      ]);
      const failed = [typeResult, machineResult, assignmentResult].find((result) => result.error);
      if (failed?.error) throw failed.error;
      const typeRows = (typeResult.data ?? []) as MachineType[];
      setItems(typeRows);
      setMachines((machineResult.data ?? []) as unknown as Machine[]);
      setAssignments((assignmentResult.data ?? []) as Assignment[]);
      setCounts(Object.fromEntries(typeRows.map((item) => [item.id, String(item.machine_count)])));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Data mesin gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const total = useMemo(
    () => items.filter((item) => item.is_active).reduce((sum, item) => sum + item.machine_count, 0),
    [items],
  );
  const verifiedCount = machines.filter((machine) => machine.machine_status !== "unverified").length;
  const assignmentByMachine = useMemo(() => new Map(assignments.map((assignment) => [assignment.machine_id, assignment])), [assignments]);

  async function saveCount(item: MachineType) {
    const value = Number(counts[item.id]);
    if (!Number.isInteger(value) || value < 0) {
      setError("Jumlah mesin harus berupa bilangan bulat nol atau lebih.");
      setNotice("");
      return;
    }
    setSaving(item.id);
    setError("");
    setNotice("");
    try {
      const db = createClient();
      const { error: saveError } = await db.from("dpcs_machine_types")
        .update({ machine_count: value, updated_at: new Date().toISOString() })
        .eq("id", item.id);
      if (saveError) throw saveError;
      setNotice(`Jumlah ${item.machine_type} berhasil diperbarui.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Jumlah mesin gagal disimpan.");
    } finally {
      setSaving(null);
    }
  }

  async function saveMachineStatus(machine: Machine, status: Machine["machine_status"]) {
    setSaving(machine.id);
    setError("");
    setNotice("");
    try {
      const db = createClient();
      const { error: saveError } = await db.from("dpcs_machines")
        .update({ machine_status: status, updated_at: new Date().toISOString() })
        .eq("id", machine.id);
      if (saveError) throw saveError;
      setNotice(`Status ${machine.machine_code} berhasil diperbarui.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Status mesin gagal disimpan.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <main className="page-shell order-page production-page">
      <header className="topbar">
        <Link className="back-link" href="/">← DPCS</Link>
        <div className="topbar-copy">
          <p className="eyebrow">MODUL 06</p>
          <h1>Machine & Capacity Management</h1>
        </div>
        <span className="environment">MASTER MESIN</span>
      </header>

      <div className="production-toolbar">
        <strong>Analisis penggunaan fasilitas</strong>
        <Link className="back-link" href="/machine-utilization">Buka laporan pemakaian mesin →</Link>
      </div>

      <section className="order-intro">
        <p className="eyebrow">DATA FASILITAS PRODUKSI</p>
        <h2>Kenali kapasitas mesin yang tersedia.</h2>
        <p className="hero-copy">
          Setiap unit mesin memiliki kode internal DPCS yang unik. Satu mesin hanya dapat
          menangani satu unit dies pada satu waktu. Penugasan aktif harus dilepas sebelum
          mesin menerima pekerjaan berikutnya.
        </p>
      </section>

      <section className="qc-summary">
        <article><span>Jenis mesin aktif</span><strong>{items.filter((item) => item.is_active).length}</strong></article>
        <article><span>Total unit mesin</span><strong>{number(total)}</strong></article>
        <article><span>Unit terverifikasi</span><strong>{number(verifiedCount)} / {number(machines.length)}</strong></article>
      </section>

      <div className="production-toolbar">
        <strong>Daftar jenis mesin</strong>
        <button type="button" onClick={() => void load()} disabled={loading}>Muat ulang</button>
      </div>

      {notice && <div className="notice notice-info">{notice}</div>}
      {error && <div className="notice notice-warning">{error}</div>}

      {loading ? (
        <div className="dashboard-message">Memuat master mesin...</div>
      ) : items.length === 0 ? (
        <div className="dashboard-message">Belum ada data jenis mesin. Jalankan migrasi Modul 06 terlebih dahulu.</div>
      ) : (
        <section className="qc-unit-panel">
          <div className="qc-history">
            {items.map((item, index) => (
              <article className="qc-history-row" key={item.id}>
                <div className="qc-history-title"><strong>{index + 1}. {item.machine_type}</strong></div>
                <div className="qc-fields">
                  <label>Jumlah unit mesin
                    <input type="number" min="0" step="1" value={counts[item.id] ?? ""}
                      onChange={(event) => setCounts((current) => ({ ...current, [item.id]: event.target.value }))} />
                  </label>
                  <button type="button" disabled={saving === item.id} onClick={() => void saveCount(item)}>
                    {saving === item.id ? "Menyimpan..." : "Simpan jumlah"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="production-toolbar">
        <strong>Identitas mesin individual ({number(machines.length)} unit)</strong>
        <span>Verifikasi kondisi fisik sebelum mengubah status</span>
      </div>

      {loading ? (
        <div className="dashboard-message">Memuat identitas mesin...</div>
      ) : machines.length === 0 ? (
        <div className="dashboard-message">Identitas mesin belum tersedia.</div>
      ) : (
        <section className="qc-unit-panel">
          <div className="qc-history">
            {machines.map((machine) => {
              const activeAssignment = assignmentByMachine.get(machine.id);
              return (
                <article className="qc-history-row" key={machine.id}>
                  <div className="qc-history-title">
                    <strong>{machine.machine_code}</strong>
                    <span>{machine.dpcs_machine_types?.machine_type ?? "Jenis mesin tidak ditemukan"}</span>
                  </div>
                  <div className="qc-fields">
                    <label>Status mesin
                      <select value={machine.machine_status} disabled={saving === machine.id || Boolean(activeAssignment)}
                        onChange={(event) => void saveMachineStatus(machine, event.target.value as Machine["machine_status"])}>
                        {Object.entries(statusLabels).filter(([value]) => value !== "in_use").map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                        {machine.machine_status === "in_use" && <option value="in_use">Sedang digunakan</option>}
                      </select>
                    </label>
                  </div>
                  {activeAssignment ? (
                    <div className="notice notice-info">
                      <strong>Penugasan aktif:</strong> Unit dies terhubung · {activeAssignment.process_code}
                      <p>Mulai: {dateTime(activeAssignment.assigned_at)}</p>
                      <p>Kelola penyelesaian pekerjaan melalui Modul 03 Production Monitoring.</p>
                    </div>
                  ) : machine.machine_status === "available" ? (
                    <p className="hero-copy">Mesin siap digunakan. Penugasan dies dan pencatatan operator dilakukan melalui Modul 03 Production Monitoring.</p>
                  ) : (
                    <p className="hero-copy">Mesin harus berstatus Tersedia sebelum dapat menerima penugasan.</p>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      <div className="notice notice-info">
        Kode mesin adalah identitas internal DPCS. Status awal Belum Diverifikasi. Saat ditugaskan,
        status otomatis menjadi Sedang digunakan. Setelah dilepas, status otomatis kembali Tersedia.
        Satu mesin tidak dapat memiliki dua penugasan aktif sekaligus.
      </div>

      <footer className="footer">
        <span>DPCS · Dies Production Control System</span>
        <Link href="/">Kembali ke dashboard</Link>
      </footer>
    </main>
  );
}
