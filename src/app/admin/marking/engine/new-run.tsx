"use client";
import { startTransition, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { PRICES, type Model } from "@/lib/ai/prices";
import { budgetReason, ITEM_COUNT } from "./run-config";
import {
  evalRunDialogData,
  startEvalRun,
  stepEvalRun,
  cancelEvalRun,
} from "./actions";
type Data = Awaited<ReturnType<typeof evalRunDialogData>>;
const modelItems = (Object.keys(PRICES) as Model[]).map((value) => ({
  value,
  label: value.startsWith("anthropic/")
    ? "Claude Sonnet 5.5"
    : value.replace("gpt-", "GPT ").replace("-", " "),
}));
export function NewRun({ data }: { data: Data }) {
  const router = useRouter();
  const [freshData, setFreshData] = useState(data);
  const refreshId = useRef(0);
  const [open, setOpen] = useState(false);
  const [model, setModel] = useState<Model>(data.defaultModel);
  const [effort, setEffort] = useState<"low" | "medium" | "high">("low");
  const [blind, setBlind] = useState(true);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<{
    id: string;
    done: number;
    status: string;
  }>();
  const stop = useRef(false);
  useEffect(
    () => () => {
      stop.current = true;
    },
    [],
  );
  const estimate = freshData.estimates[model];
  const reason = freshData.running
    ? "An eval run is already running."
    : budgetReason(freshData.spent, estimate.total);
  function show() {
    setOpen(true);
    setFreshData(data);
    const id = ++refreshId.current;
    startTransition(async () => {
      try {
        const latest = await evalRunDialogData();
        if (refreshId.current === id) setFreshData(latest);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not refresh run data.",
        );
      }
    });
    setModel(data.defaultModel);
    setRun(undefined);
    setEffort("low");
    setBlind(true);
  }
  async function start() {
    if (!model || reason) return;
    setBusy(true);
    stop.current = false;
    try {
      let next: Awaited<ReturnType<typeof stepEvalRun>> = await startEvalRun({
        model,
        effort,
        blind,
      });
      setRun(next);
      while (next.status === "running" && !stop.current) {
        next = await stepEvalRun(next.id);
        setRun(next);
      }
      if (next.error) toast.error(next.error);
      else if (!stop.current) toast.success(`Eval ${next.status}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Eval failed.");
    } finally {
      router.refresh();
      setBusy(false);
    }
  }
  async function cancel() {
    if (!run) return;
    stop.current = true;
    try {
      setRun(await cancelEvalRun(run.id));
      toast.success("Cancelled; any current item will finish.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cancel failed.");
    }
  }
  return (
    <>
      <Button onClick={show}>New run</Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent
          showCloseButton={!busy}
          className="bg-background max-h-[90dvh] max-w-full overflow-y-auto rounded-none sm:max-w-sm sm:rounded-lg"
        >
          <DialogHeader>
            <DialogTitle>New run</DialogTitle>
            <DialogDescription>
              A1 evaluation only. Two fixture exclusions leave {ITEM_COUNT}{" "}
              items.
            </DialogDescription>
          </DialogHeader>
          {run ? (
            <div role="status" aria-live="polite">
              {run.done} / {ITEM_COUNT} · {run.status}
            </div>
          ) : (
            <>
              <label htmlFor="eval-set">Test set</label>
              <Select value="a1" disabled>
                <SelectTrigger id="eval-set" className="w-full">
                  <SelectValue>A1 20-answer set</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="a1">A1 20-answer set</SelectItem>
                </SelectContent>
              </Select>
              <label htmlFor="eval-model">Model</label>
              <Select
                items={modelItems}
                value={model}
                onValueChange={(value) => {
                  if (value) setModel(value as Model);
                }}
              >
                <SelectTrigger id="eval-model" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {modelItems.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <fieldset className="space-y-2">
                <legend>Thinking</legend>
                <RadioGroup
                  value={effort}
                  onValueChange={(value) => setEffort(value as typeof effort)}
                >
                  {(["low", "medium", "high"] as const).map((v) => (
                    <label key={v} className="flex items-center gap-2">
                      <RadioGroupItem value={v} />
                      {v[0].toUpperCase() + v.slice(1)}
                    </label>
                  ))}
                </RadioGroup>
              </fieldset>
              <fieldset className="space-y-2">
                <legend>Passes</legend>
                <RadioGroup
                  value={blind ? "blind" : "single"}
                  onValueChange={(v) => setBlind(v === "blind")}
                >
                  <label className="flex items-center gap-2">
                    <RadioGroupItem value="single" />
                    Single
                  </label>
                  <label className="flex items-center gap-2">
                    <RadioGroupItem value="blind" />
                    With blind check (as production)
                  </label>
                </RadioGroup>
              </fieldset>
              {estimate && (
                <div className="space-y-1">
                  <p>
                    Estimated cost: ${estimate.total.toFixed(4)} ({ITEM_COUNT} ×
                    ${estimate.average.toFixed(4)} per answer).
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {estimate.basis}
                  </p>
                </div>
              )}
              {data && (
                <p>
                  Spent: ${freshData.spent.toFixed(4)}. Remaining budget: $
                  {freshData.remaining.toFixed(4)} before the $80 eval limit;
                  $100 overall cap.
                </p>
              )}
              {reason && <p role="status">{reason}</p>}
            </>
          )}
          <DialogFooter className="bg-background sticky -bottom-5 z-10 -mx-5 -mb-5">
            {busy ? (
              <Button
                variant="outline"
                disabled={!run || run.status !== "running"}
                onClick={cancel}
              >
                Cancel
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setOpen(false)}>
                {run ? "Close" : "Cancel"}
              </Button>
            )}
            {!run && (
              <Button disabled={busy || !!reason || !data} onClick={start}>
                Run
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
