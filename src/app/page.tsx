import AdminMenu from "./admin-menu";
import DashboardOverview from "./dashboard-overview";

const modules = [
  {
    number: "01",
    title: "Order Manajemen",
    description: "Impor dan pantau order bulanan dari Excel.",
    status: "Buka modul",
  },
  {
    number: "02",
    title: "Control Number & Dies",
    description: "Kelola spesifikasi, revisi, dan unit fisik setiap dies.",
    status: "Buka modul",
  },
  {
    number: "03",
    title: "Production Monitoring",
    description: "Pantau Workcard, proses, operator, mesin, dan status setiap unit dies.",
    status: "Buka modul",
  },
  {
    number: "04",
    title: "Quality Control (QC)",
    description: "Catat hasil GOOD/REJECT dan riwayat pemeriksaan setiap unit fisik.",
    status: "Buka modul",
  },
  {
    number: "05",
    title: "Repair & Rework",
    description: "Kelola work order perbaikan, teknisi, tindakan, dan kesiapan QC ulang.",
    status: "Buka modul",
  },
];

export default function Home() {
  return (
    <main className="page-shell">
      <header className="topbar">
        <div className="brand-mark">D</div>
        <div>
          <p className="eyebrow">DIES PRODUCTION CONTROL SYSTEM</p>
          <h1>DPCS</h1>
        </div>
        <AdminMenu />
      </header>

      <section className="hero">
        <p className="eyebrow">SISTEM KENDALI PRODUKSI DIES</p>
        <h2>Kontrol produksi yang<br />jelas, tertelusur, dan terukur.</h2>
        <p className="hero-copy">
          Satu tempat untuk memantau order, Control Number, setiap unit dies,
          perjalanan Workcard, hingga hasil QC.
        </p>
      </section>

      <section className="overview" aria-label="Status sistem">
        <div className="overview-card">
          <span className="metric-label">Pabrik</span>
          <strong>1</strong>
          <span className="metric-note">Implementasi awal</span>
        </div>
        <div className="overview-card">
          <span className="metric-label">Platform</span>
          <strong>Online</strong>
          <span className="metric-note">Web desktop & mobile</span>
        </div>
        <div className="overview-card">
          <span className="metric-label">Database</span>
          <strong>Supabase</strong>
          <span className="metric-note">Proyek telah dibuat</span>
        </div>
      </section>

      <DashboardOverview />

      <section className="modules-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">AREA KERJA</p>
            <h2>Modul utama DPCS</h2>
          </div>
          <span className="module-count">05 MODUL</span>
        </div>
        <div className="module-grid">
          {modules.map((module) => (
            <article className="module-card" key={module.number}>
              <span className="module-number">{module.number}</span>
              <h3>{module.title}</h3>
              <p>{module.description}</p>
              {module.number === "01" ? <a className="module-status module-action" href="/orders">{module.status} →</a> :
               module.number === "02" ? <a className="module-status module-action" href="/dies">{module.status} →</a> :
               module.number === "03" ? <a className="module-status module-action" href="/production">{module.status} →</a> :
               module.number === "04" ? <a className="module-status module-action" href="/qc">{module.status} →</a> :
               module.number === "05" ? <a className="module-status module-action" href="/repair">{module.status} →</a> :
               <span className="module-status">{module.status}</span>}
            </article>
          ))}
        </div>
      </section>

      <footer className="footer">
        <span>DPCS · Dies Production Control System</span>
        <span>Versi pengembangan awal</span>
      </footer>
    </main>
  );
}
