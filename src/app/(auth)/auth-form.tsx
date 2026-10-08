"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import { type AuthState, signIn, signUp } from "./actions";

const field =
  "h-12 w-full rounded-2xl border border-line bg-white px-4 text-base text-ink outline-none focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    mode === "sign-in" ? signIn : signUp,
    {},
  );
  const signingUp = mode === "sign-up";
  return (
    <form action={action} className="flex flex-col gap-4">
      {signingUp && (
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Name
          <input
            name="full_name"
            autoComplete="name"
            required
            className={field}
          />
        </label>
      )}
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Email
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Password
        <input
          name="password"
          type="password"
          minLength={8}
          autoComplete={signingUp ? "new-password" : "current-password"}
          required
          className={field}
        />
      </label>
      <p
        aria-live="polite"
        className={
          state.error ? "text-destructive text-sm" : "text-ink text-sm"
        }
      >
        {state.error ?? state.message}
      </p>
      <Button
        type="submit"
        disabled={pending}
        className="h-12 rounded-full text-base font-semibold"
      >
        {pending ? "Please wait…" : signingUp ? "Create account" : "Sign in"}
      </Button>
      <p className="text-muted-foreground text-center text-sm">
        {signingUp ? "Already have an account? " : "New to Claro? "}
        <Link
          href={signingUp ? "/sign-in" : "/sign-up"}
          className="text-ink decoration-brand font-semibold underline decoration-2 underline-offset-4"
        >
          {signingUp ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}
