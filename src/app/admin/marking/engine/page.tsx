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
import { summariseRun } from "./summary";
import { loadDocs } from "./docs";
import { Markdown } from "./markdown";
import { EngineTabs } from "./tabs";
import { RunsTable } from "./runs-table";

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
  const tab = params.tab === "runs" ? "runs" : "docs";
  let content;
  if (tab === "runs") {
    const runs = await loadEvalRuns();
    const rows = runs
      .map((run, index) => summariseRun(run, `${run.meta.stamp}-${index}`))
      .sort((a, b) => b.stamp.localeCompare(a.stamp));
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
    const docs = await loadDocs();
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
        description="Read-only engine documentation and offline evaluation results."
      />
      <EngineTabs tab={tab} />
      {content}
    </div>
  );
}
