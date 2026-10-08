import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { signOut } from "@/app/(auth)/actions";
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();
  if (profile.role !== "admin") redirect("/");
  return (
    <>
      <header className="panel m-4 flex flex-wrap items-center justify-between gap-4 p-5">
        <Link href="/admin" aria-label="Claro admin">
          <Logo />
        </Link>
        <nav aria-label="Admin navigation" className="flex gap-5">
          <Link href="/admin" className="underline">
            Admin
          </Link>
          <Link href="/admin/homework" className="underline">
            Homework
          </Link>
        </nav>
        <form action={signOut}>
          <Button variant="outline" type="submit">
            Sign out
          </Button>
        </form>
      </header>
      {children}
    </>
  );
}
