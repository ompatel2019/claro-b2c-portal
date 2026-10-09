"use client";
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, CircleAlert, CircleCheck } from "lucide-react";
import {
  bandOf,
  layoutCards,
  markLabel,
  markingState,
  nextMarkLine,
  readComments,
  uncertainParts,
  type NumberedComment,
  type ReviewRow,
} from "@/lib/feedback";
import { highlightSegments } from "@/lib/practice";
import { cn } from "@/lib/utils";
import { RetryAnswer } from "./retry-answer";
import { StatusPill, statePill } from "./status-pill";
import { Badge } from "./ui/badge";
import { buttonVariants } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { Popover, PopoverContent } from "./ui/popover";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

const reduced = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const WIDE = 1100;

/** Opens and closes like <details>, remembering the choice per browser. */
function Remembered({
  name,
  title,
  children,
}: {
  name: string;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const key = `claro-feedback-${name}`;
  useEffect(() => {
    if (ref.current) ref.current.open = localStorage.getItem(key) === "1";
  }, [key]);
  return (
    <details
      ref={ref}
      className="group rounded-xl border bg-white"
      onToggle={(e) =>
        localStorage.setItem(key, e.currentTarget.open ? "1" : "0")
      }
    >
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
        {title}
      </summary>
      <div className="px-4 pb-4 text-sm">{children}</div>
    </details>
  );
}

function CommentCard({
  c,
  active,
  className,
  ...props
}: {
  c: NumberedComment;
  active?: boolean;
} & React.ComponentProps<"div">) {
  const strength = c.kind === "strength";
  const Icon = strength ? CircleCheck : ArrowUpRight;
  return (
    <div
      data-card={c.id}
      tabIndex={-1}
      className={cn(
        "bg-card rounded-xl border p-3 text-sm transition-shadow outline-none",
        active && "ring-ink/40 ring-2",
        className,
      )}
      {...props}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="bg-ink flex size-5 items-center justify-center rounded-full text-[11px] font-semibold text-white tabular-nums">
          {c.n}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 font-semibold",
            strength ? "text-success" : "text-ink",
          )}
        >
          <Icon aria-hidden className="size-4" />
          {strength ? "Strength" : "Fix"}
        </span>
        {c.tag && <Badge variant="outline">{c.tag}</Badge>}
      </div>
      <p className="mt-1.5">{c.body}</p>
      {c.next_mark && (
        <p className="mt-1.5">
          <span className="font-semibold">Next mark:</span> {c.next_mark}
        </p>
      )}
    </div>
  );
}

function Uncertain({ text }: { text: string }) {
  return uncertainParts(text).map((p, i) =>
    p.uncertain ? (
      <span
        key={i}
        title="Hard to read. Not counted against you."
        className="decoration-warning underline decoration-dotted decoration-2 underline-offset-4"
      >
        {p.text}
      </span>
    ) : (
      p.text
    ),
  );
}

function Photos({ photos }: { photos: string[] }) {
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState<number | null>(null);
  const [big, setBig] = useState(false);
  return (
    <div className="space-y-2">
      {photos.length > 1 && (
        <div className="flex gap-1" role="tablist" aria-label="Photo pages">
          {photos.map((_, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={page === i}
              className={cn(
                buttonVariants({ variant: "outline", size: "xs" }),
                page === i && "border-ink",
              )}
              onClick={() => setPage(i)}
            >
              Page {i + 1}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className="block w-full overflow-hidden rounded-xl border"
        onClick={() => setZoom(page)}
        aria-label={`Open page ${page + 1} full screen`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
        <img
          src={photos[page]}
          alt={`Your answer, page ${page + 1}`}
          className="max-h-[70vh] w-full object-contain"
        />
      </button>
      <Dialog
        open={zoom !== null}
        onOpenChange={(open) => !open && setZoom(null)}
      >
        <DialogContent className="h-[90vh] max-w-[calc(100%-2rem)] grid-rows-[auto_1fr] sm:max-w-5xl">
          <DialogTitle>Page {(zoom ?? 0) + 1}</DialogTitle>
          <div className="overflow-auto">
            {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
            <img
              src={photos[zoom ?? 0]}
              alt={`Your answer, page ${(zoom ?? 0) + 1}, zoomed`}
              onClick={() => setBig(!big)}
              className={cn(
                "max-w-none cursor-zoom-in",
                big ? "w-[200%] cursor-zoom-out" : "w-full",
              )}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** §2.1 K14: summary, annotated answer with margin comments, guidelines and actions. */
export function AnnotatedFeedback({
  row,
  photos = [],
  actions,
}: {
  row: ReviewRow;
  photos?: string[];
  actions?: React.ReactNode;
}) {
  const state = markingState(row);
  const text = row.transcript ?? row.answer_text ?? "";
  const comments = useMemo(
    () => readComments(row.feedback, text),
    [row.feedback, text],
  );
  const [filter, setFilter] = useState<"all" | "strength" | "fix">("all");
  const [hover, setHover] = useState<number | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const [popover, setPopover] = useState<{ id: number; el: Element } | null>(
    null,
  );
  const [view, setView] = useState<"typed" | "photo">("typed");
  const [wide, setWide] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const doc = useRef<HTMLDivElement>(null);
  const margin = useRef<HTMLDivElement>(null);

  const max = row.max_marks ?? row.marks;
  const showMark = ["marked", "in_review", "reviewed"].includes(state);
  const band = bandOf(row.criteria, row.band);
  const next = nextMarkLine(comments, row.feedback, Number(row.mark) >= max);
  const visible = comments.filter((c) => filter === "all" || c.kind === filter);
  const anchored = comments.filter((c) => c.start !== null);
  const pill = statePill(state, row.review);
  const outline = Array.isArray(row.feedback?.better_answer_outline)
    ? (row.feedback.better_answer_outline as string[])
    : [];

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setWide(entry.contentRect.width >= WIDE),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Google Docs layout: each card level with its highlight, pushed down on collision.
  useLayoutEffect(() => {
    const d = doc.current;
    const m = margin.current;
    if (!wide || !d || !m) return;
    function place() {
      const area = m!.querySelector<HTMLElement>("[data-anchor-area]")!;
      const top = area.getBoundingClientRect().top;
      const cards = [...m!.querySelectorAll<HTMLElement>("[data-anchored]")];
      const tops = layoutCards(
        cards.map((card) => ({
          anchor:
            (d!
              .querySelector(`[data-anchors~="${card.dataset.card}"]`)
              ?.getBoundingClientRect().top ?? top) - top,
          height: card.offsetHeight,
        })),
      );
      cards.forEach((card, i) => (card.style.top = `${tops[i]}px`));
      const last = cards.at(-1);
      area.style.height = last
        ? `${tops.at(-1)! + last.offsetHeight}px`
        : "0px";
    }
    place();
    const observer = new ResizeObserver(place);
    observer.observe(d);
    return () => observer.disconnect();
  }, [wide, filter, view, comments]);

  const card = (id: number) =>
    root.current?.querySelector<HTMLElement>(`[data-card="${id}"]`);
  const highlight = (id: number) =>
    doc.current?.querySelector<HTMLElement>(`[data-anchors~="${id}"]`);

  function openComment(c: NumberedComment, from?: Element) {
    setHover(c.id);
    if (!wide && from) return setPopover({ id: c.id, el: from });
    const el = card(c.id);
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({
      block: "nearest",
      behavior: reduced() ? "auto" : "smooth",
    });
  }
  function jumpTo(c: NumberedComment) {
    setHover(c.id);
    const el = highlight(c.id);
    if (!el) return;
    el.scrollIntoView({
      block: "center",
      behavior: reduced() ? "auto" : "smooth",
    });
    setFlash(c.id);
    setTimeout(() => setFlash((f) => (f === c.id ? null : f)), 1500);
  }
  function onKey(e: React.KeyboardEvent) {
    if ((e.target as HTMLElement).closest("input, textarea, select")) return;
    const order = visible;
    const at = order.findIndex((c) => c.id === hover);
    if (["j", "J", "ArrowDown", "k", "K", "ArrowUp"].includes(e.key)) {
      if (!order.length) return;
      e.preventDefault();
      const step = ["k", "K", "ArrowUp"].includes(e.key) ? -1 : 1;
      const c =
        order[at < 0 ? (step > 0 ? 0 : order.length - 1) : at + step] ??
        order[at];
      setHover(c.id);
      (highlight(c.id) ?? card(c.id))?.focus();
    } else if (e.key === "Escape") {
      setHover(null);
      setPopover(null);
    }
  }

  const label = (c: NumberedComment) =>
    `${c.kind === "strength" ? "Strength" : "Fix"} ${c.n}${c.tag ? `, ${c.tag}` : ""}: ${c.body}`;
  const shown = (c: NumberedComment) => visible.includes(c);
  const answer = (
    <div
      ref={doc}
      className="relative max-w-[70ch] text-base leading-[26px] whitespace-pre-wrap"
    >
      {highlightSegments(text, anchored).map((seg) => {
        const covering = seg.comments
          .map((i) => anchored[i])
          .filter((c) => showMark && shown(c));
        if (!covering.length)
          return <Uncertain key={seg.start} text={seg.text} />;
        // Where highlights overlap, the later comment wins.
        const owner = covering.reduce((a, b) => (b.n > a.n ? b : a));
        const starts = covering.filter((c) => c.start === seg.start);
        const ends = covering.filter(
          (c) => c.start! + c.quote.length === seg.start + seg.text.length,
        );
        const focusable = starts[0];
        return (
          <span key={seg.start}>
            <mark
              data-anchors={starts.map((c) => c.id).join(" ") || undefined}
              role={focusable ? "button" : undefined}
              tabIndex={focusable ? 0 : undefined}
              aria-label={focusable ? label(focusable) : undefined}
              onClick={(e) => openComment(owner, e.currentTarget)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openComment(focusable ?? owner, e.currentTarget);
                }
              }}
              onMouseEnter={() => setHover(owner.id)}
              onMouseLeave={() => setHover(null)}
              className={cn(
                "text-ink cursor-pointer rounded-[2px] border-b-2 outline-offset-1",
                owner.kind === "strength"
                  ? "bg-success-soft border-success"
                  : "bg-accent border-primary",
                covering.some((c) => c.id === hover) &&
                  "outline-ink/40 outline-2",
                covering.some((c) => c.id === flash) && "outline-ink outline-2",
              )}
            >
              <Uncertain text={seg.text} />
            </mark>
            {ends.map((c) => (
              <sup
                key={c.id}
                aria-hidden
                className="bg-ink mx-0.5 rounded-full px-1 text-[10px] font-semibold text-white"
              >
                {c.n}
              </sup>
            ))}
          </span>
        );
      })}
    </div>
  );

  const cardProps = (c: NumberedComment) => ({
    c,
    active: hover === c.id || flash === c.id,
    onMouseEnter: () => setHover(c.id),
    onMouseLeave: () => setHover(null),
    onClick: () => jumpTo(c),
    onKeyDown: (e: React.KeyboardEvent) => e.key === "Enter" && jumpTo(c),
    className: "cursor-pointer",
  });
  const filterBar = showMark && comments.length > 0 && (
    <ToggleGroup
      aria-label="Filter comments"
      size="sm"
      variant="outline"
      value={[filter]}
      onValueChange={(v) => v[0] && setFilter(v[0] as typeof filter)}
    >
      <ToggleGroupItem value="all">All ({comments.length})</ToggleGroupItem>
      <ToggleGroupItem value="strength">
        Strengths ({comments.filter((c) => c.kind === "strength").length})
      </ToggleGroupItem>
      <ToggleGroupItem value="fix">
        Fixes ({comments.filter((c) => c.kind === "fix").length})
      </ToggleGroupItem>
    </ToggleGroup>
  );
  const overall = visible.filter((c) => c.start === null);
  const marginCards = showMark && comments.length > 0 && (
    <div>
      {wide ? (
        <div ref={margin}>
          <div data-anchor-area className="relative">
            {visible
              .filter((c) => c.start !== null)
              .map((c) => (
                <CommentCard
                  key={c.id}
                  data-anchored=""
                  {...cardProps(c)}
                  className="absolute inset-x-0 cursor-pointer"
                />
              ))}
          </div>
          {overall.length > 0 && (
            <div className="mt-4 space-y-2">
              <h4 className="text-muted-foreground text-xs font-semibold tracking-[0.04em] uppercase">
                Overall
              </h4>
              {overall.map((c) => (
                <CommentCard key={c.id} {...cardProps(c)} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <ol className="space-y-2">
          {visible.map((c, i) => (
            <li key={c.id}>
              {c.start === null && overall[0] === c && (
                <h4
                  className={cn(
                    "text-muted-foreground mb-2 text-xs font-semibold tracking-[0.04em] uppercase",
                    i > 0 && "mt-4",
                  )}
                >
                  Overall
                </h4>
              )}
              <CommentCard {...cardProps(c)} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
  const popComment = comments.find((c) => c.id === popover?.id);

  return (
    <div ref={root} className="space-y-4" onKeyDown={onKey}>
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            {showMark ? (
              <p className="text-[28px] leading-9 font-semibold tabular-nums">
                {markLabel(row, state)}
              </p>
            ) : (
              state === "marking" && (
                <div
                  aria-hidden
                  className="bg-muted h-9 w-24 animate-pulse rounded-lg"
                />
              )
            )}
            {showMark && band && (
              <Tooltip>
                <TooltipTrigger render={<span tabIndex={0} />}>
                  <Badge variant="secondary">{band.label}</Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  {band.row.descriptor}
                </TooltipContent>
              </Tooltip>
            )}
            {pill && <StatusPill pill={pill} />}
          </div>
          {state === "in_review" &&
            row.review?.reason !== "student_dispute" && (
              <p>Our team is double-checking this mark.</p>
            )}
          {state === "failed" && (
            <div
              role="alert"
              className="bg-destructive-soft space-y-2 rounded-xl p-3"
            >
              <p className="text-destructive flex items-center gap-2 font-semibold">
                <CircleAlert aria-hidden className="size-4" />
                We couldn’t mark this one.
              </p>
              <RetryAnswer id={row.attempt_id} />
            </div>
          )}
          {state === "unreadable" && (
            <p role="alert" className="font-semibold">
              We couldn’t read this photo.
            </p>
          )}
          {state === "not_answered" && (
            <p>No answer was given, so there was nothing to mark.</p>
          )}
          {state === "marking" && (
            <div aria-hidden className="space-y-2">
              <div className="bg-muted h-4 w-2/3 animate-pulse rounded" />
              <div className="bg-muted h-4 w-1/2 animate-pulse rounded" />
            </div>
          )}
          {showMark && next && (
            <div>
              <h3 className="text-sm font-semibold">
                What gets you the next mark
              </h3>
              <p className="mt-1">{next}</p>
            </div>
          )}
          {showMark && comments.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  ["Strengths", "strength"],
                  ["Top fixes", "fix"],
                ] as const
              ).map(([title, kind]) => {
                const items = comments
                  .filter((c) => c.kind === kind)
                  .slice(0, 3);
                return items.length ? (
                  <div key={kind}>
                    <h3 className="text-sm font-semibold">{title}</h3>
                    <ul className="mt-1 space-y-1">
                      {items.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            className="text-left underline-offset-4 hover:underline"
                            onClick={() => {
                              setFilter("all");
                              jumpTo(c);
                              card(c.id)?.focus({ preventScroll: true });
                            }}
                          >
                            {c.n}. {c.body}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null;
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {(filterBar || (photos.length > 0 && text)) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {view === "typed" && filterBar}
          {photos.length > 0 && text && (
            <ToggleGroup
              aria-label="Answer view"
              variant="outline"
              size="sm"
              value={[view]}
              onValueChange={(v) => v[0] && setView(v[0] as typeof view)}
            >
              <ToggleGroupItem value="typed">Typed copy</ToggleGroupItem>
              <ToggleGroupItem value="photo">Photo</ToggleGroupItem>
            </ToggleGroup>
          )}
        </div>
      )}
      {(view === "photo" || !text) && photos.length > 0 ? (
        <Photos photos={photos} />
      ) : text ? (
        <div
          className={cn(
            "grid gap-6",
            wide && "grid-cols-[minmax(0,1fr)_320px]",
          )}
        >
          <div className="space-y-2">
            {photos.length > 0 && (
              <p className="text-muted-foreground text-[13px]">
                Highlights show on the typed copy of your photo.
              </p>
            )}
            {answer}
          </div>
          {marginCards}
        </div>
      ) : null}
      <Popover
        open={!!popComment}
        onOpenChange={(open) => !open && setPopover(null)}
      >
        <PopoverContent anchor={popover?.el} className="w-80 p-0">
          {popComment && <CommentCard c={popComment} className="border-0" />}
        </PopoverContent>
      </Popover>

      {showMark && (
        <div className="space-y-2">
          {!!row.criteria?.length && (
            <Remembered name="guidelines" title="Marking guidelines">
              <table className="w-full text-left">
                <thead className="text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Marks</th>
                    <th className="py-2 font-medium">Descriptor</th>
                  </tr>
                </thead>
                <tbody>
                  {row.criteria.map((c) => (
                    <tr
                      key={c.descriptor}
                      className={cn(
                        "border-t border-dashed",
                        c === band?.row && "bg-accent",
                      )}
                    >
                      <td className="py-2 pr-3 align-top tabular-nums">
                        {c.min === c.max ? c.min : `${c.min}–${c.max}`}
                      </td>
                      <td className="py-2">
                        {c.descriptor}
                        {c === band?.row && (
                          <Badge variant="outline" className="ml-2">
                            Your band
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Remembered>
          )}
          {row.sample_answer && (
            <Remembered name="model" title="Model answer">
              <p className="whitespace-pre-wrap">{row.sample_answer}</p>
              <p className="text-muted-foreground mt-2 text-[13px]">
                One strong answer. Other answers can earn the same marks.
              </p>
            </Remembered>
          )}
          {outline.length > 0 && (
            <Remembered name="outline" title="How to reach full marks">
              <ul className="list-disc space-y-1 pl-5">
                {outline.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </Remembered>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {row.topic_id && (
          <Link
            className={buttonVariants({ variant: "outline", size: "sm" })}
            href={`/student/sprint?type=${row.type}&sub=${encodeURIComponent(row.topic_id)}`}
          >
            Practise similar
          </Link>
        )}
        {actions}
      </div>
    </div>
  );
}
