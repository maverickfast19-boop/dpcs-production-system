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

function number(value: number) {
  return new Intl.NumberFormat("id-ID").format(value);
}

export default function MachineManager() {
  const [items, setItems] = useState<MachineType[]>([]);
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
      const { data, error: loadError } = await db.from("dpcs_machine_types")
        .select("id,machine_type,machine_count,process_group,notes,is_active")
        .order("machine_type");
      if (loadError) throw loadError;
      const rows = (data ?? []) as MachineType[];
      setItems(rows);
      setCounts(Object.fromEntries(rows.map((item) => [item.id, String(item.machine_count)])));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Data master mesin gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const total = useMemo(
    () => items.filter((item) => item.is_active).reduce((sum, item) => sum + item.machine_count, 0),
    [items],
  );

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
          Tahap pertama mencatat jenis dan jumlah mesin aktual. Penjadwalan, antrean,
          dan utilisasi akan dibangun setelah identitas tiap mesin dan prosesnya divalidasi.
        </p>
      </section>

      <section className="qc-summary">
        <article><span>Jenis mesin aktif</span><strong>{items.filter((item) => item.is_active).length}</strong></article>
        <article><span>Total unit mesin</span><strong>{number(total)}</strong></article>
        <article><span>Status data</span><strong>{loading ? "Memuat" : "Tersimpan"}</strong></article>
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
                <div className="qc-history-title">
                  <strong>{index + 1}. {item.machine_type}</strong>
                  <span>{item.process_group}</span>
                </div>
                <div className="qc-fields">
                  <label>Jumlah unit mesin
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={counts[item.id] ?? ""}
                      onChange={(event) => setCounts((current) => ({ ...current, [item.id]: event.target.value }))}
                    />
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

      <div className="notice notice-info">
        Catatan: jumlah di atas adalah kapasitas berdasarkan jenis mesin, bukan daftar nomor aset individual.
        Data nomor mesin, kondisi, shift, dan jam kerja akan ditambahkan pada tahap berikutnya.
      </div>

      <footer className="footer">
        <span>DPCS · Dies Production Control System</span>
        <Link href="/">Kembali ke dashboard</Link>
      </footer>
    </main>
  );
}
