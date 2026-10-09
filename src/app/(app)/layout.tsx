import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { sydneyToday } from "@/lib/flashcards";
import { createClient } from "@/utils/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Toaster } from "sonner";
import { FeedbackWidget } from "@/components/feedback-widget";
import { FlashcardPersistDrain } from "@/components/flashcard-persist-drain";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();
  if (profile.role === "admin") redirect("/admin");
  const db = await createClient();
  const [{ count }, jar] = await Promise.all([
    db
      .from("flashcard_progress")
      .select("flashcard_id,flashcards!inner(id)", {
        count: "exact",
        head: true,
      })
      .eq("flashcards.status", "live")
      .eq("user_id", profile.id)
      .lte("due_on", sydneyToday()),
    cookies(),
  ]);
  return (
    <FeedbackWidget userId={profile.id}>
      <AppShell
        kind="student"
        name={profile.full_name}
        badges={{ "/student/flashcards": count ?? 0 }}
        defaultOpen={jar.get("sidebar_state")?.value !== "false"}
      >
        <FlashcardPersistDrain />
        <div className="pb-0 lg:pb-24">{children}</div>
        <Toaster position="bottom-center" />
      </AppShell>
    </FeedbackWidget>
  );
}
