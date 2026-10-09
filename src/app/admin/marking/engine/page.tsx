import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Target } from "@/components/icons";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { loadEvalRuns } from "../accuracy/eval";
import { mergeRuns } from "./summary";
import { loadDocs } from "./docs";
import { Markdown } from "./markdown";
import { EngineTabs } from "./tabs";
import { RunsTable } from "./runs-table";
import { loadBucketRuns } from "./store";
import { NewRun } from "./new-run";
import { loadComparison } from "./compare-data";
import { CompareView } from "./compare-view";
import { evalRunDialogData } from "./actions";

export const maxDuration = 300;

function commitLabel(date: string) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Australia/Sydney",
  }).format(new Date(date));
}
export default async function EnginePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const comparing =
    params.tab === "runs" && (params.a !== undefined || params.b !== undefined);
  let dialogData: Awaited<ReturnType<typeof evalRunDialogData>> | null = null;
  const tab = params.tab === "runs" ? "runs" : "docs";
  let content;
  if (comparing) {
    const data = await loadComparison(params.a, params.b);
    content = data ? (
      <CompareView data={data} />
    ) : (
      <div className="space-y-3">
        <p role="alert">Choose two different known runs to compare.</p>
        <Link href="/admin/marking/engine?tab=runs" className="underline">
          Back to runs
        </Link>
      </div>
    );
  } else if (tab === "runs") {
    const [dialog, runs, web] = await Promise.all([
      evalRunDialogData(),
      loadEvalRuns(),
      loadBucketRuns(),
    ]);
    dialogData = dialog;
    const rows = mergeRuns(runs, web);
    content = rows.length ? (
      <RunsTable rows={rows} />
    ) : (
      <EmptyState
        icon={Target}
        title="No eval runs yet"
        description="Bundled offline evaluation runs will appear here."
      />
    );
  } else {
    const [dialog, docs] = await Promise.all([evalRunDialogData(), loadDocs()]);
    dialogData = dialog;
    const selected = docs.find((doc) => doc.id === params.doc) ?? docs[0];
    content = !selected ? (
      <EmptyState
        icon={Target}
        title="No engine docs yet"
        description="Marking engine documentation will appear here when available."
      />
    ) : (
      <div className="grid min-w-0 gap-4 md:grid-cols-[13rem_minmax(0,1fr)]">
        <Card className="min-w-0 self-start">
          <CardContent>
            <nav
              aria-label="Engine documents"
              className="flex min-w-0 gap-2 overflow-x-auto md:flex-col"
            >
              {docs.map((doc) => (
                <Link
                  key={doc.id}
                  href={`/admin/marking/engine?tab=docs&doc=${encodeURIComponent(doc.id)}`}
                  aria-current={doc.id === selected.id ? "page" : undefined}
                  className={cn(
                    "shrink-0 rounded-md px-3 py-2 text-sm",
                    doc.id === selected.id
                      ? "bg-muted font-medium"
                      : "hover:bg-muted",
                  )}
                >
                  {doc.id}
                  {doc.committedAt && (
                    <span className="text-muted-foreground mt-1 block text-xs">
                      Last commit {commitLabel(doc.committedAt)}
                    </span>
                  )}
                </Link>
              ))}
            </nav>
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>{selected.id}</CardTitle>
            {selected.committedAt && (
              <CardDescription>
                Last commit {commitLabel(selected.committedAt)} (Sydney)
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="min-w-0">
            <Markdown text={selected.text} />
          </CardContent>
        </Card>
      </div>
    );
  }
  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        title="Marking engine"
        description="Engine documentation and evaluation results."
        actions={dialogData ? <NewRun data={dialogData} /> : undefined}
      />
      <EngineTabs tab={tab} />
      {content}
    </div>
  );
}
