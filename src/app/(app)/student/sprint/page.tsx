import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import {
  answered,
  modeLabel,
  timeLimit,
  timer,
  type Session,
  type Topic,
} from "@/lib/practice";
import { PageHeader } from "@/components/page-header";
import { SprintSetup } from "@/components/sprint-setup";
import { FinishSprint } from "@/components/finish-sprint";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function SprintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const profile = await requireProfile();
  const db = await createClient();
  const [topics, open] = await Promise.all([
    db.from("topics").select("id,parent_id,name,sort").order("sort"),
    db
      .from("sessions")
      .select("*,attempts(choice_index,answer_text,transcript)")
      .eq("user_id", profile.id)
      .eq("kind", "sprint")
      .is("finished_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (topics.error) throw new Error("Could not load topics.");
  const p = await searchParams;
  const params = Object.fromEntries(
    ["type", "topics", "sub", "history", "verb", "size"].map((k) => [k, p[k]]),
  );
  const unfinished = open.data as
    (Session & { attempts: Parameters<typeof answered>[0][] }) | null;
  const limit = unfinished && timeLimit(unfinished.config);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Topic Sprint"
        description="Build exactly the practice you need. The bar below shows what you'll get."
      />
      {unfinished && (
        <Card className="mx-auto max-w-[720px]">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <p>
              You have an unfinished {modeLabel(unfinished.config.mode)} sprint
              · {unfinished.attempts.filter(answered).length}/
              {unfinished.attempts.length} answered
              {limit
                ? ` · ${timer(Math.max(0, limit - (unfinished.elapsed_s ?? 0)))} left`
                : ""}
            </p>
            <div className="flex gap-2">
              <Link
                className={buttonVariants({ size: "sm" })}
                href={`/student/sprint/${unfinished.id}`}
              >
                Continue
              </Link>
              <FinishSprint id={unfinished.id} />
            </div>
          </CardContent>
        </Card>
      )}
      <SprintSetup topics={(topics.data ?? []) as Topic[]} params={params} />
    </div>
  );
}
