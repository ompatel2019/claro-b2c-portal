export function Logo({ wordClassName }: { wordClassName?: string }) {
  return (
    <span className="text-ink inline-flex items-center gap-2 text-xl leading-none font-bold tracking-[-0.04em]">
      <svg
        width="24"
        height="24"
        viewBox="0 0 40 40"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="40" height="40" rx="11" fill="#f54f1b" />
        <path
          d="M27 14.5a8 8 0 1 0 0 11"
          stroke="var(--color-surface)"
          strokeWidth="5"
          strokeLinecap="round"
        />
      </svg>
      <span className={wordClassName}>claro.</span>
    </span>
  );
}
