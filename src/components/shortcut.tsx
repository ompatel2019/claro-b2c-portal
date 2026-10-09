"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isTyping } from "./session-shell";

/** A single-key page shortcut (e.g. Home's S = start sprint); ignored while typing. */
export function Shortcut({ k, href }: { k: string; href: string }) {
  const router = useRouter();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (e.key.toLowerCase() === k) router.push(href);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [k, href, router]);
  return null;
}
