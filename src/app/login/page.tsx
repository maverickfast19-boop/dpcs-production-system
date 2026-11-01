"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.replace("/");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login gagal. Periksa email dan password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page-shell">
      <header className="topbar">
        <div className="brand-mark">D</div>
        <div className="topbar-copy">
          <p className="eyebrow">DIES PRODUCTION CONTROL SYSTEM</p>
          <h1>DPCS · Login Admin</h1>
        </div>
        <a className="back-link" href="/">Beranda</a>
      </header>

      <section className="login-wrap">
        <div className="login-card">
          <p className="eyebrow">AKSES SISTEM</p>
          <h2>Masuk ke DPCS</h2>
          <p className="login-description">Gunakan email dan password akun yang telah dibuat di Supabase.</p>
          <form onSubmit={handleLogin} className="login-form">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nama@perusahaan.com" />
            <label htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Masukkan password" />
            <button type="submit" disabled={loading}>{loading ? "Memproses..." : "Login"}</button>
          </form>
          {message && <p className="login-message" role="alert">{message}</p>}
          <p className="login-footnote">Jangan bagikan password kepada siapa pun.</p>
        </div>
      </section>
    </main>
  );
}
