"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Order = {
  id: string;
  po_date: string;
  due_date: string;
  source_reference: string | null;
  customer_id: string;
};
type Customer = { id: string; customer_name: string };
type Line = { id: string; die_order_id: string; quantity: number };
type Unit = { id: string; order_line_id: string; status: string };

const number = (value: number) => new Intl.NumberFormat("id-ID").format(value);
const dateLabel = (value: string) =>
  new Date(value + "T00:00:00").toLocaleDateString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
  });
const localDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function DashboardOverview() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function loadDashboard() {
      setLoading(true);
      setError("");
      try {
        const supabase = createClient();
        const [orderResult, customerResult, lineResult, unitResult] = await Promise.all([
          supabase.from("die_orders").select("id,po_date,due_date,source_reference,customer_id").order("due_date", { ascending: true }),
          supabase.from("customers").select("id,customer_name").order("customer_name"),
          supabase.from("die_order_lines").select("id,die_order_id,quantity"),
          supabase.from("die_units").select("id,order_line_id,status"),
        ]);
        const failed = [orderResult, customerResult, lineResult, unitResult].find((result) => result.error);
        if (failed?.error) throw failed.error;
        if (!active) return;
        setOrders((orderResult.data ?? []) as Order[]);
        setCustomers((customerResult.data ?? []) as Customer[]);
        setLines((lineResult.data ?? []) as Line[]);
        setUnits((unitResult.data ?? []) as Unit[]);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Data dashboard tidak dapat dimuat.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadDashboard();
    return () => { active = false; };
  }, []);

  const summary = useMemo(() => {
    const today = localDate(new Date());
    const soon = new Date();
    soon.setDate(soon.getDate() + 7);
    const sevenDays = localDate(soon);
    const lineByOrder = new Map<string, number>();
    for (const line of lines) lineByOrder.set(line.die_order_id, (lineByOrder.get(line.die_order_id) ?? 0) + line.quantity);
    const customerNames = new Map(customers.map((customer) => [customer.id, customer.customer_name]));
    const unitStatus = new Map<string, number>();
    for (const unit of units) unitStatus.set(unit.status, (unitStatus.get(unit.status) ?? 0) + 1);
    const overdue = orders.filter((order) => order.due_date < today);
    const dueSoon = orders.filter((order) => order.due_date >= today && order.due_date <= sevenDays);
    const customerCounts = new Map<string, number>();
    for (const order of orders) {
      const name = customerNames.get(order.customer_id) ?? "Customer tidak diketahui";
      customerCounts.set(name, (customerCounts.get(name) ?? 0) + 1);
    }
    const topCustomers = [...customerCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const recent = [...orders].sort((a, b) => b.po_date.localeCompare(a.po_date)).slice(0, 8);
    return {
      totalUnits: lines.reduce((sum, line) => sum + line.quantity, 0),
      totalOrders: orders.length,
      overdue: overdue.length,
      dueSoon: dueSoon.length,
      dueSoonOrders: dueSoon.slice(0, 5),
      topCustomers,
      recent,
      customerNames,
      lineByOrder,
      unitStatus,
    };
  }, [orders, customers, lines, units]);

  const statusLabels: Record<string, string> = {
    ordered: "Menunggu produksi",
    in_production: "Dalam produksi",
    manufactured: "Selesai dibuat",
    available: "Tersedia",
    in_use: "Sedang digunakan",
    maintenance: "Maintenance",
    repair: "Perbaikan",
    scrapped: "Tidak digunakan",
  };

  return (
    <section className="dashboard-section" aria-label="Dashboard produksi">
      <div className="section-heading">
        <div>
          <p className="eyebrow">MONITORING AKTUAL</p>
          <h2>Dashboard Produksi</h2>
        </div>
        <Link className="dashboard-refresh" href="/">Muat ulang halaman</Link>
      </div>

      {loading ? (
        <div className="dashboard-message">Mengambil data terbaru dari database...</div>
      ) : error ? (
        <div className="dashboard-message dashboard-error">
          Gagal memuat dashboard: {error}
          <p>Pastikan akun sudah login dan kebijakan akses database mengizinkan pembacaan data.</p>
        </div>
      ) : (
        <>
          <div className="dashboard-metrics">
            <article className="dashboard-metric">
              <span>Total order</span><strong>{number(summary.totalOrders)}</strong><small>Order tersimpan</small>
            </article>
            <article className="dashboard-metric">
              <span>Total unit dies</span><strong>{number(summary.totalUnits)}</strong><small>Unit berdasarkan Qty order</small>
            </article>
            <article className="dashboard-metric dashboard-warning">
              <span>Mendekati due date</span><strong>{number(summary.dueSoon)}</strong><small>Jatuh tempo 7 hari ke depan</small>
            </article>
            <article className="dashboard-metric dashboard-danger">
              <span>Terlambat</span><strong>{number(summary.overdue)}</strong><small>Lewat due date</small>
            </article>
          </div>

          <div className="dashboard-columns">
            <section className="dashboard-panel">
              <div className="dashboard-panel-heading">
                <h3>Jadwal due date terdekat</h3><span>7 hari ke depan</span>
              </div>
              {summary.dueSoonOrders.length ? (
                <div className="dashboard-list">
                  {summary.dueSoonOrders.map((order) => (
                    <div className="dashboard-list-row" key={order.id}>
                      <div><strong>{order.source_reference || "Tanpa Control Number"}</strong><small>{summary.customerNames.get(order.customer_id) ?? "Customer tidak diketahui"}</small></div>
                      <time>{dateLabel(order.due_date)}</time>
                    </div>
                  ))}
                </div>
              ) : <p className="dashboard-empty">Tidak ada order yang jatuh tempo dalam 7 hari ke depan.</p>}
            </section>

            <section className="dashboard-panel">
              <div className="dashboard-panel-heading">
                <h3>Order per customer</h3><span>5 teratas</span>
              </div>
              {summary.topCustomers.length ? (
                <div className="dashboard-list">
                  {summary.topCustomers.map(([name, count]) => (
                    <div className="dashboard-list-row" key={name}>
                      <strong>{name}</strong><span className="dashboard-count">{number(count)} order</span>
                    </div>
                  ))}
                </div>
              ) : <p className="dashboard-empty">Belum ada data customer.</p>}
            </section>
          </div>

          <section className="dashboard-panel dashboard-status-panel">
            <div className="dashboard-panel-heading">
              <h3>Status unit dies</h3><span>{number(units.length)} unit tercatat</span>
            </div>
            {units.length ? (
              <div className="status-chip-list">
                {[...summary.unitStatus.entries()].map(([status, count]) => (
                  <div className="status-chip" key={status}>
                    <span>{statusLabels[status] ?? status}</span><strong>{number(count)}</strong>
                  </div>
                ))}
              </div>
            ) : <p className="dashboard-empty">Belum ada unit dies tercatat.</p>}
          </section>

          <section className="dashboard-panel dashboard-recent-panel">
            <div className="dashboard-panel-heading">
              <h3>Order terbaru</h3><Link href="/orders">Buka Order Manajemen →</Link>
            </div>
            {summary.recent.length ? (
              <div className="table-scroll">
                <table className="dashboard-table">
                  <thead><tr><th>Control Number</th><th>Customer</th><th>Tanggal PO</th><th>Due date</th><th>Qty unit</th></tr></thead>
                  <tbody>
                    {summary.recent.map((order) => (
                      <tr key={order.id}>
                        <td><strong>{order.source_reference || "—"}</strong></td>
                        <td>{summary.customerNames.get(order.customer_id) ?? "—"}</td>
                        <td>{dateLabel(order.po_date)}</td>
                        <td>{dateLabel(order.due_date)}</td>
                        <td>{number(summary.lineByOrder.get(order.id) ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="dashboard-empty">Belum ada order di database.</p>}
          </section>
        </>
      )}
    </section>
  );
}
