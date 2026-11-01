"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AdminMenu() {
  const router = useRouter();
  const [adminName, setAdminName] = useState("");
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    async function loadAdmin() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;

      if (!user) {
        setAdminName("");
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!active) return;
      setAdminName(profile?.display_name || user.email || "Admin");
      setLoading(false);
    }

    void loadAdmin();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      void loadAdmin();
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleLogout() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  if (loading) return <span className="admin-menu-loading">Memuat...</span>;

  if (!adminName) {
    return <a className="environment login-link" href="/login">LOGIN</a>;
  }

  return (
    <div className="admin-menu">
      <span className="admin-name">{adminName}</span>
      <button className="logout-button" type="button" onClick={handleLogout} disabled={signingOut}>
        {signingOut ? "Keluar..." : "Log out"}
      </button>
    </div>
  );
}
