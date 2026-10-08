export function Logo() {
  return (
    <span className="text-ink inline-flex items-center gap-[9px] text-[27px] leading-none font-extrabold tracking-[-0.055em]">
      <svg
        width="34"
        height="34"
        viewBox="0 0 40 40"
        fill="none"
        aria-hidden="true"
      >
        <rect width="40" height="40" rx="13" fill="#f54f1b" />
        <path
          d="M27 14.5a8 8 0 1 0 0 11"
          stroke="var(--color-surface)"
          strokeWidth="5"
          strokeLinecap="round"
        />
      </svg>
      <span>
        claro<span className="text-ink">.</span>
      </span>
    </span>
  );
}
