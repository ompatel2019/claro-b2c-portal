import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { Toaster } from "sonner";
import { admin } from "@/utils/supabase/admin";
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();
  if (profile.role !== "admin") redirect("/student");
  const { count, error } = await admin()
    .from("mark_reviews")
    .select("*", { count: "exact", head: true })
    .eq("status", "open");
  const jar = await cookies();
  return (
    <AppShell
      kind="admin"
      name={profile.full_name}
      badges={{ "/admin/marking/review": error ? 0 : (count ?? 0) }}
      defaultOpen={jar.get("sidebar_state")?.value !== "false"}
    >
      {children}
      <Toaster position="bottom-center" />
    </AppShell>
  );
}
