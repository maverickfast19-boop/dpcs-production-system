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

type DieUnit = {
  id: string;
  unit_sequence: number;
  physical_unit_code: string | null;
  die_model_id: string;
  die_models: { control_number: string; description: string } | null;
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

const processLabels: Record<string, string> = {
  machining: "Machining",
  assembly: "Assembly",
  fitting: "Fitting",
  trial: "Trial",
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
  const [units, setUnits] = useState<DieUnit[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [selectedUnits, setSelectedUnits] = useState<Record<string, string>>({});
  const [selectedProcesses, setSelectedProcesses] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const db = createClient();
      const [typeResult, machineResult, unitResult, assignmentResult] = await Promise.all([
        db.from("dpcs_machine_types")
          .select("id,machine_type,machine_count,process_group,notes,is_active")
          .order("machine_type"),
        db.from("dpcs_machines")
          .select("id,machine_code,machine_status,machine_type_id,dpcs_machine_types(machine_type)")
          .order("machine_code"),
        db.from("die_units")
          .select("id,unit_sequence,physical_unit_code,die_model_id,die_models(control_number,description)")
          .order("created_at", { ascending: false }),
        db.from("dpcs_machine_assignments")
          .select("id,machine_id,die_unit_id,process_code,assigned_at")
          .is("released_at", null),
      ]);
      const failed = [typeResult, machineResult, unitResult, assignmentResult].find((result) => result.error);
      if (failed?.error) throw failed.error;
      const typeRows = (typeResult.data ?? []) as MachineType[];
      setItems(typeRows);
      setMachines((machineResult.data ?? []) as unknown as Machine[]);
      setUnits((unitResult.data ?? []) as unknown as DieUnit[]);
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
  const unitMap = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);
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

  async function assignMachine(machine: Machine) {
    const dieUnitId = selectedUnits[machine.id];
    const processCode = selectedProcesses[machine.id] || "machining";
    if (!dieUnitId) {
      setError("Pilih unit dies terlebih dahulu.");
      setNotice("");
      return;
    }
    setSaving(machine.id);
    setError("");
    setNotice("");
    try {
      const db = createClient();
      const { error: assignError } = await db.rpc("dpcs_assign_machine", {
        p_machine_id: machine.id,
        p_die_unit_id: dieUnitId,
        p_process_code: processCode,
      });
      if (assignError) throw assignError;
      setNotice(`Mesin ${machine.machine_code} berhasil ditugaskan.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Penugasan mesin gagal disimpan.");
    } finally {
      setSaving(null);
    }
  }

  async function releaseMachine(assignment: Assignment, machineCode: string) {
    setSaving(assignment.machine_id);
    setError("");
    setNotice("");
    try {
      const db = createClient();
      const { error: releaseError } = await db.rpc("dpcs_release_machine", {
        p_assignment_id: assignment.id,
      });
      if (releaseError) throw releaseError;
      setNotice(`Mesin ${machineCode} berhasil dilepas dan kembali tersedia.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Penugasan mesin gagal dilepas.");
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
              const assignedUnit = activeAssignment ? unitMap.get(activeAssignment.die_unit_id) : null;
              const unitLabel = assignedUnit
                ? `${assignedUnit.die_models?.control_number ?? "Tanpa Control Number"} · ${assignedUnit.physical_unit_code || `Unit #${assignedUnit.unit_sequence}`}`
                : "";
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
                      <strong>Penugasan aktif:</strong> {unitLabel} · {processLabels[activeAssignment.process_code] ?? activeAssignment.process_code}
                      <p>Mulai: {dateTime(activeAssignment.assigned_at)}</p>
                      <button type="button" disabled={saving === machine.id}
                        onClick={() => void releaseMachine(activeAssignment, machine.machine_code)}>
                        {saving === machine.id ? "Memproses..." : "Lepas mesin"}
                      </button>
                    </div>
                  ) : machine.machine_status === "available" ? (
                    <div className="qc-fields">
                      <label>Unit dies
                        <select value={selectedUnits[machine.id] ?? ""}
                          onChange={(event) => setSelectedUnits((current) => ({ ...current, [machine.id]: event.target.value }))}>
                          <option value="">Pilih unit dies</option>
                          {units.map((unit) => (
                            <option key={unit.id} value={unit.id}>
                              {(unit.die_models?.control_number ?? "Tanpa Control Number") + " · " +
                                (unit.physical_unit_code || `Unit #${unit.unit_sequence}`) +
                                (unit.die_models?.description ? " — " + unit.die_models.description : "")}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>Proses
                        <select value={selectedProcesses[machine.id] ?? "machining"}
                          onChange={(event) => setSelectedProcesses((current) => ({ ...current, [machine.id]: event.target.value }))}>
                          <option value="machining">Machining</option>
                          <option value="assembly">Assembly</option>
                          <option value="fitting">Fitting</option>
                          <option value="trial">Trial</option>
                        </select>
                      </label>
                      <button type="button" disabled={saving === machine.id || units.length === 0}
                        onClick={() => void assignMachine(machine)}>
                        {saving === machine.id ? "Menugaskan..." : "Tugaskan dies"}
                      </button>
                    </div>
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
