"use client";

import { useEffect } from "react";
import { toast } from "sonner";

export function ReviewNotice({ message }: { message?: string }) {
  const resolved = message === "Resolved. Next review";
  useEffect(() => {
    if (resolved) toast.success(message, { id: "review-resolved" });
  }, [message, resolved]);
  return message && !resolved ? (
    <p role="status" className="rounded-lg border p-3 text-sm">
      {message}
    </p>
  ) : null;
}
