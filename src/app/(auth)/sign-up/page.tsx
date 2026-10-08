import type { Metadata } from "next";

import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Create your account</h1>
      <p className="text-muted-foreground mt-1 mb-6 font-serif text-xl italic">
        Practise past HSC questions with instant feedback.
      </p>
      <AuthForm mode="sign-up" />
    </>
  );
}
