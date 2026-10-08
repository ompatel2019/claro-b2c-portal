import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();
  if (profile.role !== "admin") redirect("/");
  const jar = await cookies();
  return (
    <AppShell
      kind="admin"
      name={profile.full_name}
      defaultOpen={jar.get("sidebar_state")?.value !== "false"}
    >
      {children}
    </AppShell>
  );
}
