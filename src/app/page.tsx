const modules = [
  {
    number: "01",
    title: "Order Manajemen",
    description: "Impor dan pantau order bulanan dari Excel.",
    status: "Tahap berikutnya",
  },
  {
    number: "02",
    title: "Control Number & Dies",
    description: "Kelola spesifikasi, revisi, dan unit fisik setiap dies.",
    status: "Tahap berikutnya",
  },
  {
    number: "03",
    title: "Workcard Produksi",
    description: "Pantau urutan proses, departemen, dan mesin.",
    status: "Tahap berikutnya",
  },
  {
    number: "04",
    title: "Polishing & QC",
    description: "Catat marking unit, hasil QC per unit, dan keputusan repair.",
    status: "Tahap berikutnya",
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
        <span className="environment">PERSIAPAN SISTEM</span>
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

      <section className="modules-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">AREA KERJA</p>
            <h2>Modul utama DPCS</h2>
          </div>
          <span className="module-count">04 MODUL</span>
        </div>
        <div className="module-grid">
          {modules.map((module) => (
            <article className="module-card" key={module.number}>
              <span className="module-number">{module.number}</span>
              <h3>{module.title}</h3>
              <p>{module.description}</p>
              <span className="module-status">{module.status}</span>
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