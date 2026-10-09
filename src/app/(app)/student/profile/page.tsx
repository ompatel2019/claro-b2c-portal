import { pageMetadata } from "@/lib/page-metadata";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { singleParams, tableParams } from "@/lib/admin";
import { reviewHref } from "@/lib/profile";
import { createClient } from "@/utils/supabase/server";
import { ProfileForm } from "@/components/profile-form";
import { PasswordForm } from "@/components/password-form";
import {
  ProfileHistory,
  ProfileLoadError,
  type FeedbackRow,
  type ReviewRow,
} from "@/components/profile-history";
import { signOut } from "@/app/(auth)/actions";
import { signOutEverywhere } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
function ProfileSkeleton({ height = "h-48" }: { height?: string }) {
  return (
    <Card className="p-5" aria-busy="true">
      <Skeleton className="h-6 w-36" />
      <Skeleton className={`${height} w-full`} />
    </Card>
  );
}
async function Details() {
  const p = await requireProfile();
  const db = await createClient();
  const [details, auth] = await Promise.all([
    db
      .from("profiles")
      .select("full_name,year_level,school")
      .eq("id", p.id)
      .maybeSingle(),
    db.auth.getUser(),
  ]);
  if (details.error || auth.error)
    return (
      <Card className="p-5">
        <h2 className="text-base font-semibold">Details</h2>
        <ProfileLoadError />
      </Card>
    );
  if (!details.data) notFound();
  return (
    <ProfileForm
      profile={details.data}
      email={auth.data.user?.email ?? ""}
      userId={p.id}
    />
  );
}
async function History({
  kind,
  params,
}: {
  kind: "feedback" | "reviews";
  params: Record<string, string | undefined>;
}) {
  const p = await requireProfile();
  const db = await createClient();
  const state = tableParams(
    {
      page: params[`${kind}_page`],
      sort: params[`${kind}_sort`],
      dir: params[`${kind}_dir`],
    },
    { id: "created_at", dir: "desc" },
  );
  const allowed =
    kind === "feedback"
      ? ["created_at", "kind", "status"]
      : ["created_at", "status"];
  if (!allowed.includes(state.sort.id)) state.sort.id = "created_at";
  state.page = Math.min(state.page, Math.floor(2_147_483_647 / 20));
  const start = (state.page - 1) * 20;
  const query =
    kind === "feedback"
      ? db
          .from("feedback")
          .select("id,created_at,kind,message,status,admin_note", {
            count: "exact",
          })
          .eq("user_id", p.id)
      : db
          .from("mark_reviews")
          .select(
            "id,created_at,student_note,status,ai_mark,final_mark,attempts!inner(position,question_id,questions(source),session_id,sessions!inner(id,kind))",
            { count: "exact" },
          )
          .eq("user_id", p.id)
          .eq("reason", "student_dispute")
          .eq("attempts.user_id", p.id)
          .in("attempts.sessions.kind", ["sprint", "single"])
          .eq("attempts.sessions.user_id", p.id);
  let result = await query
    .order(state.sort.id, { ascending: state.sort.dir === "asc" })
    .order("id")
    .range(start, start + 19);
  // PostgREST omits count on an out-of-range response; recover to page one.
  if (result.error?.code === "PGRST103") {
    state.page = 1;
    result = await query.range(0, 19);
  }
  const total = result.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / 20));
  if (state.page > pages && result.count !== null) {
    state.page = pages;
    const lastStart = (pages - 1) * 20;
    result = await query.range(lastStart, lastStart + 19);
  }
  const pager = { ...state, total, pages };
  if (kind === "feedback")
    return (
      <ProfileHistory
        kind={kind}
        rows={(result.data ?? []) as unknown as FeedbackRow[]}
        pager={pager}
        error={!!result.error}
      />
    );
  type Joined = Omit<ReviewRow, "question" | "href"> & {
    attempts: {
      position: number;
      question_id: string | null;
      questions: { source: string } | null;
      sessions: { id: string; kind: string };
    };
  };
  const rows = ((result.data ?? []) as unknown as Joined[]).map((r) => ({
    ...r,
    question:
      r.attempts.questions?.source ?? r.attempts.question_id ?? "Your question",
    href: reviewHref(r.attempts.sessions, r.attempts.position),
  }));
  return (
    <ProfileHistory
      kind={kind}
      rows={rows}
      pager={pager}
      error={!!result.error}
    />
  );
}
export const metadata = pageMetadata("Profile");

export default async function Profile({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = singleParams(await searchParams);
  return (
    <div className="mx-auto w-full max-w-[720px] min-w-0 space-y-4">
      <PageHeader title="Profile" />
      <Suspense fallback={<ProfileSkeleton height="h-80" />}>
        <Details />
      </Suspense>
      <PasswordForm />
      <Suspense fallback={<ProfileSkeleton />}>
        <History kind="feedback" params={params} />
      </Suspense>
      <Suspense fallback={<ProfileSkeleton />}>
        <History kind="reviews" params={params} />
      </Suspense>
      <Card className="p-5">
        <h2 className="text-base font-semibold">Sessions</h2>
        <div className="flex flex-wrap gap-3">
          <form action={signOut}>
            <Button variant="outline" type="submit">
              Sign out
            </Button>
          </form>
          <form action={signOutEverywhere}>
            <Button variant="outline" type="submit">
              Sign out everywhere
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
