import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { loadHomeworkList } from "@/lib/homework-data";
import { StudentNav } from "@/components/student-nav";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();
  if (profile.role === "admin") redirect("/admin");
  const { sets, sessions } = await loadHomeworkList();
  const homeworkCount = sets.filter(
    (set) =>
      !sessions.some((s) => s.homework_set_id === set.id && s.finished_at),
  ).length;
  return (
    <div className="min-h-screen lg:bg-[linear-gradient(to_right,#fff_calc(16rem-1px),var(--color-line)_calc(16rem-1px),var(--color-line)_16rem,transparent_16rem)]">
      <a className="sr-only focus:not-sr-only" href="#main">
        Skip to content
      </a>
      <StudentNav name={profile.full_name} homeworkCount={homeworkCount} />
      <main
        id="main"
        className="mx-auto max-w-7xl px-5 py-8 sm:px-10 lg:ml-64 lg:px-12 lg:py-12"
      >
        {children}
      </main>
    </div>
  );
}
