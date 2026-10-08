import type { Metadata } from "next";

import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <>
      <h1>Welcome back</h1>
      <p className="text-muted-foreground mt-1 mb-6 text-sm">
        Pick up where you left off.
      </p>
      <AuthForm
        mode="sign-in"
        next={next?.startsWith("/") && !next.startsWith("//") ? next : "/"}
      />
    </>
  );
}
