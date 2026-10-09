"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { startPaper } from "@/app/(focus)/student/papers/[id]/actions";
import { plural } from "@/lib/practice";
import { TYPE_LABEL } from "@/lib/results";
import { paperDuration, paperSections } from "@/lib/paper-session";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from "./ui/alert-dialog";
export function PaperStart({
  paper,
  sections,
}: {
  paper: {
    id: string;
    title: string;
    source: string | null;
    year: number | null;
    time_limit_min: number;
    total_marks: number;
  };
  sections: ReturnType<typeof paperSections>;
}) {
  const router = useRouter();
  const [reading, setReading] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function start() {
    setBusy(true);
    setError("");
    try {
      const result = await startPaper(paper.id, reading);
      if (result.error) setError(result.error);
      else {
        router.refresh();
      }
    } catch {
      setError("Could not start your paper. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <Link
        href="/student/papers"
        className="mb-4 inline-flex min-h-11 items-center text-sm underline underline-offset-4"
      >
        Back to papers
      </Link>
      <Card className="space-y-5 p-5">
        <h1 className="text-[28px] font-semibold">{paper.title}</h1>
        <p>{[paper.source, paper.year].filter(Boolean).join(" · ")}</p>
        <p>
          {paperDuration(paper.time_limit_min)}
          {reading ? " + 5 minutes reading time" : ""} · {paper.total_marks}{" "}
          marks
        </p>
        <ul className="space-y-3">
          {sections.map((section) => (
            <li key={section.name}>
              <strong>{section.name}</strong> ·{" "}
              {section.units
                .filter((u) => u.positions.length > 1)
                .map((u) => `answer 1 of ${u.positions.length}`)
                .join("; ")}
              {section.units.some((u) => u.positions.length > 1) && " · "}
              {section.types.length === 1
                ? plural(
                    section.questions,
                    section.types[0] === "mcq"
                      ? "multiple choice question"
                      : TYPE_LABEL[
                          section.types[0] as keyof typeof TYPE_LABEL
                        ].toLowerCase(),
                  )
                : plural(section.questions, "question")}{" "}
              · {section.marks} marks · about {section.aboutMin} min
            </li>
          ))}
        </ul>
        <ul className="list-disc space-y-2 pl-5">
          <li>The timer can’t be paused, even if you leave</li>
          <li>Answers save automatically</li>
          <li>Calculator available</li>
          <li>Photo answers up to 8 pages per question</li>
        </ul>
        <label className="flex items-center gap-3">
          <Switch
            checked={reading}
            onCheckedChange={setReading}
            aria-label="Include 5 minutes reading time"
          />
          Include 5 minutes reading time
        </label>
        {error && !confirm && <p role="alert">{error}</p>}
        <Button onClick={() => setConfirm(true)}>Start paper</Button>
        <AlertDialog open={confirm} onOpenChange={setConfirm}>
          <AlertDialogContent>
            <AlertDialogTitle>Start paper?</AlertDialogTitle>
            <AlertDialogDescription>
              The {paperDuration(paper.time_limit_min, true)} timer starts now
              and can’t be paused.
              {reading && " Includes 5 extra minutes reading time."}
            </AlertDialogDescription>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setConfirm(false)}
              >
                Cancel
              </Button>
              <Button disabled={busy} onClick={() => void start()}>
                {busy ? "Starting…" : "Start"}
              </Button>
            </div>
            {error && <p role="alert">{error}</p>}
          </AlertDialogContent>
        </AlertDialog>
      </Card>
    </main>
  );
}
