"use client";

import { ChangeEvent, useMemo, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";

type OrderRow = {
  rowNumber: number;
  poDate: string;
  dueDate: string;
  controlNumber: string;
  customer: string;
  description: string;
  material: string;
  quantity: number;
  unitPrice: number;
  sourceTotal: number | null;
  errors: string[];
  warnings: string[];
};

const normalize = (value: unknown) =>
  String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");

function readDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number" && value > 0) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return [parsed.y, String(parsed.m).padStart(2, "0"), String(parsed.d).padStart(2, "0")].join("-");
    }
  }
  const text = String(value ?? "").trim();
  if (!text) return "";
  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) return [iso[1], iso[2].padStart(2, "0"), iso[3].padStart(2, "0")].join("-");
  const local = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (local) return [local[3], local[2].padStart(2, "0"), local[1].padStart(2, "0")].join("-");
  return "";
}

function readNumber(value: unknown): number {
  if (typeof value === "number") return value;
  const cleaned = String(value ?? "").trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (!cleaned) return 0;
  const result = Number(cleaned);
  return Number.isFinite(result) ? result : Number.NaN;
}

function money(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function parseWorkbook(data: ArrayBuffer): OrderRow[] {
  const workbook = XLSX.read(data, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("File Excel tidak memiliki worksheet.");
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true });
  if (rows.length < 2) throw new Error("Worksheet belum memiliki baris data.");

  const headers = (rows[0] as unknown[]).map(normalize);
  const find = (...names: string[]) => headers.findIndex((header) => names.includes(header));
  const columns = {
    poDate: find("tanggalpo"),
    dueDate: find("duedatedelivery", "duedate"),
    controlNumber: find("controlnumber"),
    customer: find("customer", "pelanggan"),
    description: find("deskripsi", "desrkipsi", "description"),
    material: find("material"),
    quantity: find("qty", "quantity"),
    unitPrice: find("price", "unitprice", "hargasatuan"),
    total: find("total", "totalprice"),
  };
  const required: Array<[string, number]> = [
    ["Tanggal PO", columns.poDate],
    ["Due date Delivery", columns.dueDate],
    ["Control Number", columns.controlNumber],
    ["Customer", columns.customer],
    ["Deskripsi", columns.description],
    ["Material", columns.material],
    ["Qty", columns.quantity],
    ["Price", columns.unitPrice],
  ];
  const missing = required.filter(([, index]) => index < 0).map(([name]) => name);
  if (missing.length) {
    throw new Error("Kolom tidak ditemukan: " + missing.join(", ") + ". Periksa judul kolom pada Excel.");
  }

  return rows.slice(1).map((raw, index) => {
    const row = raw as unknown[];
    const value = (column: number) => row[column] ?? "";
    const poDate = readDate(value(columns.poDate));
    const dueDate = readDate(value(columns.dueDate));
    const quantity = readNumber(value(columns.quantity));
    const unitPrice = readNumber(value(columns.unitPrice));
    const sourceTotal = columns.total >= 0 && value(columns.total) !== ""
      ? readNumber(value(columns.total))
      : null;
    const errors: string[] = [];
    const warnings: string[] = [];
    const controlNumber = String(value(columns.controlNumber)).trim();
    const customer = String(value(columns.customer)).trim();
    const description = String(value(columns.description)).trim();
    const material = String(value(columns.material)).trim();

    if (!poDate) errors.push("Tanggal PO tidak valid");
    if (!dueDate) errors.push("Due date tidak valid");
    if (poDate && dueDate && dueDate < poDate) errors.push("Due date lebih awal dari Tanggal PO");
    if (!controlNumber) errors.push("Control Number kosong");
    if (!customer) errors.push("Customer kosong");
    if (!description) errors.push("Deskripsi kosong");
    if (!material) errors.push("Material kosong");
    if (!Number.isInteger(quantity) || quantity <= 0) errors.push("Qty harus bilangan bulat lebih dari 0");
    if (!Number.isFinite(unitPrice) || unitPrice < 0) errors.push("Price harus angka nol atau lebih");
    const calculated = Number.isFinite(quantity) && Number.isFinite(unitPrice) ? quantity * unitPrice : 0;
    if (sourceTotal !== null && Number.isFinite(sourceTotal) && Math.abs(sourceTotal - calculated) > 1) {
      warnings.push("Total Excel berbeda dari Qty × Price; DPCS memakai hasil perhitungan");
    }
    if (sourceTotal !== null && !Number.isFinite(sourceTotal)) {
      warnings.push("Nilai Total Excel tidak terbaca; DPCS akan menghitung ulang");
    }

    return {
      rowNumber: index + 2,
      poDate,
      dueDate,
      controlNumber,
      customer,
      description,
      material,
      quantity,
      unitPrice,
      sourceTotal: Number.isFinite(sourceTotal) ? sourceTotal : null,
      errors,
      warnings,
    };
  }).filter((row) =>
    row.poDate || row.dueDate || row.controlNumber || row.customer || row.description ||
    row.material || row.quantity || row.unitPrice
  );
}

export default function OrderManager() {
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [message, setMessage] = useState("");
  const [isReading, setIsReading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedBatchId, setSavedBatchId] = useState("");

  const validRows = useMemo(() => rows.filter((row) => row.errors.length === 0), [rows]);
  const invalidRows = rows.length - validRows.length;
  const totalUnits = validRows.reduce((sum, row) => sum + row.quantity, 0);
  const totalValue = validRows.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0);

  async function handleSave() {
    if (validRows.length === 0 || isSaving || savedBatchId) return;
    const months = [...new Set(validRows.map((row) => row.poDate.slice(0, 7)))];
    if (months.length !== 1) {
      setMessage("Satu file impor harus berisi order dari satu bulan PO. Pisahkan file berdasarkan bulan.");
      return;
    }
    setIsSaving(true);
    setMessage("");
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("import_dpcs_orders", {
        p_file_name: fileName,
        p_period: `${months[0]}-01`,
        p_row_count: rows.length,
        p_rejected_count: invalidRows,
        p_rows: validRows.map((row) => ({
          rowNumber: row.rowNumber, poDate: row.poDate, dueDate: row.dueDate,
          controlNumber: row.controlNumber, customer: row.customer,
          description: row.description, material: row.material,
          quantity: row.quantity, unitPrice: row.unitPrice,
        })),
      });
      if (error) throw error;
      setSavedBatchId(String(data));
      setMessage(`Berhasil disimpan ke database. ${validRows.length} baris order valid tersimpan; ${invalidRows} baris tidak valid tidak ikut disimpan.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gagal menyimpan order ke database.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage("");
    setRows([]);
    setFileName(file.name);
    setIsReading(true);
    try {
      const data = await file.arrayBuffer();
      const parsed = parseWorkbook(data);
      if (!parsed.length) throw new Error("Tidak ada baris order yang dapat dibaca.");
      setRows(parsed);
      setSavedBatchId("");
      setMessage("Preview berhasil dibuat. Periksa data sebelum menyimpannya ke database.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "File tidak dapat dibaca.");
    } finally {
      setIsReading(false);
      event.target.value = "";
    }
  }

  return (
    <main className="page-shell order-page">
      <header className="topbar">
        <Link className="back-link" href="/">← DPCS</Link>
        <div className="topbar-copy">
          <p className="eyebrow">MODUL 01</p>
          <h1>Order Manajemen</h1>
        </div>
        <span className="environment">PREVIEW</span>
      </header>

      <section className="order-intro">
        <p className="eyebrow">IMPORT ORDER BULANAN</p>
        <h2>Periksa data sebelum masuk ke sistem.</h2>
        <p className="hero-copy">
          Unggah file Excel Order Manajemen. DPCS akan membaca worksheet pertama,
          memeriksa kolom wajib, menghitung nilai order, dan menampilkan unit dies
          yang akan dibuat. File diproses di browser dan belum dikirim ke database.
        </p>
      </section>

      <section className="upload-panel">
        <div className="upload-icon">XLS</div>
        <div className="upload-copy">
          <h3>Pilih file Excel bulanan</h3>
          <p>Format .xlsx atau .xls · Gunakan judul kolom Order Manajemen yang biasa dipakai.</p>
        </div>
        <label className="upload-button">
          {isReading ? "Membaca file..." : "Pilih file Excel"}
          <input type="file" accept=".xlsx,.xls" onChange={handleFile} disabled={isReading} />
        </label>
      </section>

      {fileName && <p className="file-name">File dipilih: <strong>{fileName}</strong></p>}
      {message && <div className={rows.length ? "notice notice-info" : "notice notice-warning"}>{message}</div>}

      {rows.length > 0 && (
        <>
          <section className="order-stats">
            <div className="stat-card"><span>Baris order</span><strong>{rows.length}</strong></div>
            <div className="stat-card"><span>Valid</span><strong>{validRows.length}</strong></div>
            <div className="stat-card"><span>Perlu diperbaiki</span><strong>{invalidRows}</strong></div>
            <div className="stat-card"><span>Total unit dies</span><strong>{totalUnits}</strong></div>
            <div className="stat-card stat-wide"><span>Nilai order valid</span><strong>{money(totalValue)}</strong></div>
          </section>

          <section className="preview-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">HASIL PEMBACAAN</p>
                <h2>Preview order</h2>
              </div>
              <span className="module-count">{validRows.length} / {rows.length} VALID</span>
            </div>
            <div className="table-scroll">
              <table className="order-table">
                <thead>
                  <tr>
                    <th>Baris</th><th>Tanggal PO</th><th>Due date</th><th>Control Number</th>
                    <th>Customer</th><th>Deskripsi</th><th>Material</th><th>Qty</th>
                    <th>Price</th><th>Total hitung</th><th>Pemeriksaan</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.rowNumber}>
                      <td>{row.rowNumber}</td>
                      <td>{row.poDate || "—"}</td>
                      <td>{row.dueDate || "—"}</td>
                      <td className="cell-strong">{row.controlNumber || "—"}</td>
                      <td>{row.customer || "—"}</td>
                      <td>{row.description || "—"}</td>
                      <td>{row.material || "—"}</td>
                      <td>{Number.isFinite(row.quantity) ? row.quantity : "—"}</td>
                      <td>{Number.isFinite(row.unitPrice) ? money(row.unitPrice) : "—"}</td>
                      <td>{Number.isFinite(row.quantity * row.unitPrice) ? money(row.quantity * row.unitPrice) : "—"}</td>
                      <td>
                        {row.errors.length > 0
                          ? <span className="row-error">{row.errors.join("; ")}</span>
                          : <span className="row-valid">Valid</span>}
                        {row.warnings.map((warning) => <span className="row-warning" key={warning}>{warning}</span>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="next-step-panel">
            <strong>{savedBatchId ? "Impor berhasil disimpan" : "Simpan order ke database"}</strong>
            <p>{savedBatchId ? `Nomor batch impor: ${savedBatchId}` : `Hanya ${validRows.length} baris valid yang akan disimpan. ${invalidRows} baris bermasalah tidak ikut disimpan. Pastikan seluruh order dalam file berasal dari satu bulan PO.`}</p>
            <button type="button" className="upload-button" onClick={handleSave} disabled={isSaving || validRows.length === 0 || Boolean(savedBatchId)}>
              {isSaving ? "Menyimpan..." : savedBatchId ? "Sudah tersimpan" : "Simpan order valid"}
            </button>
          </section>
        </>
      )}

      <footer className="footer">
        <span>DPCS · Dies Production Control System</span>
        <Link href="/">Kembali ke dashboard</Link>
      </footer>
    </main>
  );
}
