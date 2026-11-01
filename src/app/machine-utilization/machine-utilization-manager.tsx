"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Machine = {
  id: string;
  machine_code: string;
  machine_status: string;
  dpcs_machine_types: { machine_type: string } | null;
};

type Assignment = {
  id: string;
  machine_id: string;
  die_unit_id: string;
  process_code: string;
  assigned_at: string;
  released_at: string | null;
  dpcs_machines: Machine | null;
  die_units: {
    unit_sequence: number;
    physical_unit_code: string | null;
    die_models: { control_number: string; description: string } | null;
  } | null;
};

const processLabels: Record<string, string> = {
  machining: "Machining",
  assembly: "Assembly",
  fitting: "Fitting",
  trial: "Trial",
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function durationMinutes(start: string, end?: string | null) {
  const elapsed = Math.max(0, (new Date(end ?? Date.now()).getTime() - new Date(start).getTime()) / 60000);
  return Math.floor(elapsed);
}

function formatDuration(minutes: number) {
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return days + " hari " + hours + " jam";
  if (hours > 0) return hours + " jam " + mins + " menit";
  return mins + " menit";
}

export default function MachineUtilizationManager() {
  const [rows, setRows] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const db = createClient();
      const { data, error: queryError } = await db
        .from("dpcs_machine_assignments")
        .select("id,machine_id,die_unit_id,process_code,assigned_at,released_at,dpcs_machines(machine_code,machine_status,dpcs_machine_types(machine_type)),die_units(unit_sequence,physical_unit_code,die_models(control_number,description))")
        .order("assigned_at", { ascending: false });
      if (queryError) throw queryError;
      setRows((data ?? []) as unknown as Assignment[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Riwayat penggunaan mesin gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      const active = !row.released_at;
      if (scope === "active" && !active) return false;
      if (scope === "completed" && active) return false;
      const machine = row.dpcs_machines?.machine_code ?? "";
      const type = row.dpcs_machines?.dpcs_machine_types?.machine_type ?? "";
      const control = row.die_units?.die_models?.control_number ?? "";
      const unit = row.die_units?.physical_unit_code ?? ("Unit #" + (row.die_units?.unit_sequence ?? ""));
      return !term || [machine, type, control, unit, processLabels[row.process_code] ?? row.process_code]
        .some((value) => value.toLowerCase().includes(term));
    });
  }, [rows, search, scope]);

  const summary = useMemo(() => {
    const active = rows.filter((row) => !row.released_at);
    const completed = rows.filter((row) => Boolean(row.released_at));
    const totalMinutes = rows.reduce((sum, row) => sum + durationMinutes(row.assigned_at, row.released_at), 0);
    return { active: active.length, completed: completed.length, totalMinutes };
  }, [rows]);

  const machineSummary = useMemo(() => {
    const map = new Map<string, { code: string; type: string; jobs: number; minutes: number; active: boolean }>();
    for (const row of rows) {
      const code = row.dpcs_machines?.machine_code ?? "Mesin tidak diketahui";
      const current = map.get(row.machine_id) ?? {
        code,
        type: row.dpcs_machines?.dpcs_machine_types?.machine_type ?? "-",
        jobs: 0,
        minutes: 0,
        active: false,
      };
      current.jobs += 1;
      current.minutes += durationMinutes(row.assigned_at, row.released_at);
      current.active = current.active || !row.released_at;
      map.set(row.machine_id, current);
    }
    return [...map.values()].sort((a, b) => b.minutes - a.minutes);
  }, [rows]);

  return (
    <main className="page-shell order-page production-page">
      <header className="topbar">
        <Link className="back-link" href="/machines">← Manajemen Mesin</Link>
        <div className="topbar-copy">
          <p className="eyebrow">MODUL 07</p>
          <h1>Machine Utilization</h1>
        </div>
        <span className="environment">LAPORAN MESIN</span>
      </header>

      <section className="order-intro">
        <p className="eyebrow">ANALISIS FASILITAS PRODUKSI</p>
        <h2>Ketahui bagaimana setiap mesin digunakan.</h2>
        <p className="hero-copy">
          Durasi dihitung dari waktu penugasan sampai mesin dilepas. Penugasan yang masih aktif
          dihitung sampai waktu saat laporan dibuka dan akan terus bertambah selama belum dilepas.
        </p>
      </section>

      <section className="qc-summary">
        <article><span>Total penugasan tercatat</span><strong>{rows.length}</strong></article>
        <article><span>Sedang digunakan</span><strong>{summary.active}</strong></article>
        <article><span>Sudah dilepas</span><strong>{summary.completed}</strong></article>
        <article><span>Total durasi pemakaian</span><strong>{formatDuration(summary.totalMinutes)}</strong></article>
      </section>

      {error && <div className="notice notice-warning">{error}</div>}

      <div className="production-toolbar">
        <strong>Ringkasan per mesin</strong>
        <button type="button" onClick={() => void load()} disabled={loading}>Muat ulang</button>
      </div>

      {loading ? (
        <div className="dashboard-message">Memuat laporan pemakaian mesin...</div>
      ) : machineSummary.length === 0 ? (
        <div className="dashboard-message">
          Belum ada riwayat penugasan mesin. Data akan muncul setelah mesin ditugaskan ke dies dan kemudian digunakan.
        </div>
      ) : (
        <section className="qc-unit-panel">
          <div className="qc-history">
            {machineSummary.map((machine) => (
              <article className="qc-history-row" key={machine.code}>
                <div className="qc-history-title">
                  <strong>{machine.code}</strong>
                  <span>{machine.type}</span>
                </div>
                <div className="qc-fields">
                  <span><strong>{machine.jobs}</strong> penugasan</span>
                  <span><strong>{formatDuration(machine.minutes)}</strong> durasi tercatat</span>
                  <span>{machine.active ? "Masih digunakan" : "Tidak ada penugasan aktif"}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="production-toolbar">
        <strong>Riwayat penugasan mesin</strong>
        <span>{filtered.length} data ditampilkan</span>
      </div>
      <section className="qc-unit-panel">
        <div className="qc-fields">
          <label>Cari mesin / Control Number / unit dies
            <input value={search} onChange={(event) => setSearch(event.target.value)}
              placeholder="Contoh: CNC-MILL-01 atau Control Number" />
          </label>
          <label>Status riwayat
            <select value={scope} onChange={(event) => setScope(event.target.value)}>
              <option value="all">Semua penugasan</option>
              <option value="active">Sedang digunakan</option>
              <option value="completed">Sudah dilepas</option>
            </select>
          </label>
        </div>
        {loading ? (
          <div className="dashboard-message">Memuat riwayat...</div>
        ) : filtered.length === 0 ? (
          <div className="dashboard-message">Tidak ada riwayat yang sesuai dengan pencarian atau filter.</div>
        ) : (
          <div className="qc-history">
            {filtered.map((row) => {
              const machine = row.dpcs_machines;
              const unit = row.die_units;
              const active = !row.released_at;
              const elapsed = durationMinutes(row.assigned_at, row.released_at);
              return (
                <article className="qc-history-row" key={row.id}>
                  <div className="qc-history-title">
                    <strong>{machine?.machine_code ?? "Mesin tidak diketahui"}</strong>
                    <span>{machine?.dpcs_machine_types?.machine_type ?? "Jenis mesin -"}</span>
                  </div>
                  <p>
                    <strong>Dies:</strong> {unit?.die_models?.control_number ?? "Tanpa Control Number"} ·{" "}
                    {unit?.physical_unit_code || "Unit #" + (unit?.unit_sequence ?? "-")}
                  </p>
                  <p><strong>Proses:</strong> {processLabels[row.process_code] ?? row.process_code}</p>
                  <p><strong>Mulai:</strong> {formatDate(row.assigned_at)}</p>
                  <p><strong>Selesai:</strong> {row.released_at ? formatDate(row.released_at) : "Belum dilepas"}</p>
                  <p><strong>Durasi:</strong> {formatDuration(elapsed)}</p>
                  <span className="notice notice-info">
                    {active ? "Penugasan aktif" : "Penugasan selesai"}
                  </span>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className="notice notice-info">
        Catatan: laporan ini menghitung durasi kalender dari waktu penugasan hingga pelepasan,
        termasuk waktu di luar jam kerja. Analisis jam kerja efektif, shift, downtime, dan kapasitas
        terencana dapat ditambahkan pada tahap berikutnya.
      </div>

      <footer className="footer">
        <span>DPCS · Dies Production Control System</span>
        <Link href="/">Kembali ke dashboard</Link>
      </footer>
    </main>
  );
}
