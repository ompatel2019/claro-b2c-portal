import { cookies } from "next/headers";
import { Toaster } from "sonner";
import { requireAdmin } from "@/lib/auth";
import { loadAdminBadges } from "@/lib/admin-data";
import { AppShell } from "@/components/app-shell";
import { admin } from "@/utils/supabase/admin";
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireAdmin();
  const [jar, badges, { count, error }] = await Promise.all([
    cookies(),
    loadAdminBadges().catch(() => ({})),
    admin()
      .from("mark_reviews")
      .select("*", { count: "exact", head: true })
      .eq("status", "open"),
  ]);
  return (
    <AppShell
      kind="admin"
      name={profile.full_name}
      badges={{ ...badges, "/admin/marking/review": error ? 0 : (count ?? 0) }}
      defaultOpen={jar.get("sidebar_state")?.value !== "false"}
    >
      {children}
      <Toaster position="bottom-center" />
    </AppShell>
  );
}
