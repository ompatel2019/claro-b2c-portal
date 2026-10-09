import { dateLabel } from "./practice";

/** Relative time for admin queues (§0): "just now", "12 min ago", "3 h ago", "2 d ago", then the date. */
export function ago(iso: string, now = new Date()) {
  const minutes = Math.floor((now.getTime() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} h ago`;
  if (minutes < 60 * 24 * 14) return `${Math.floor(minutes / 1440)} d ago`;
  return dateLabel(iso);
}

/** Sydney calendar day of an instant, "YYYY-MM-DD". */
export function sydneyDay(iso: string | Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof iso === "string" ? new Date(iso) : iso);
}
