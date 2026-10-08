"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "./logo";
import { Button } from "./ui/button";
import { signOut } from "@/app/(auth)/actions";
const items = [
  ["Dashboard", "/"],
  ["Practice", "/practice"],
  ["Flashcards", "/flashcards"],
  ["Homework", "/homework"],
  ["Activity", "/activity"],
  ["Profile", "/profile"],
];
export function StudentNav({
  name,
  homeworkCount = 0,
}: {
  name: string | null;
  homeworkCount?: number;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const links = (
    <nav aria-label="Main navigation" className="grid gap-2">
      {items.map(([label, href]) => {
        const active = href === "/" ? path === href : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            onClick={() => setOpen(false)}
            className={`rounded-full px-5 py-3 font-semibold ${active ? "bg-peach text-ink" : "hover:bg-paper"}`}
          >
            {label}
            {href === "/homework" && homeworkCount > 0 && (
              <span
                className="chip ml-2"
                aria-label={`${homeworkCount} homework sets to do`}
              >
                {homeworkCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
  const account = (
    <div className="border-line space-y-3 border-t pt-5">
      <p className="text-sm break-words">{name}</p>
      <form action={signOut}>
        <Button variant="outline" type="submit">
          Sign out
        </Button>
      </form>
    </div>
  );
  return (
    <>
      <aside className="border-line fixed inset-y-0 left-0 z-20 hidden h-dvh w-64 flex-col gap-12 overflow-y-auto border-r bg-white p-7 lg:flex">
        <Link href="/" aria-label="Claro dashboard">
          <Logo />
        </Link>
        {links}
        <div className="mt-auto">{account}</div>
      </aside>
      <header className="rounded-panel border-line m-3 border bg-white p-4 lg:hidden">
        <div className="flex items-center justify-between">
          <Link href="/" aria-label="Claro dashboard">
            <Logo />
          </Link>
          <Button
            variant="outline"
            aria-expanded={open}
            aria-controls="mobile-navigation"
            onClick={() => setOpen(!open)}
          >
            {open ? "Close menu" : "Open menu"}
          </Button>
        </div>
        {open && (
          <div id="mobile-navigation" className="mt-5 space-y-5">
            {links}
            {account}
          </div>
        )}
      </header>
    </>
  );
}
