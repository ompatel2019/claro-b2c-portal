"use client";
import AdminError from "../../error";

/** Retry re-fetches the server page using the current Next.js error-boundary API. */
export default function Error({
  unstable_retry,
}: {
  unstable_retry: () => void;
}) {
  return <AdminError reset={unstable_retry} />;
}
