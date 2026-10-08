import type { Metadata } from "next";

import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <>
      <h1>Create your account</h1>
      <p className="text-muted-foreground mt-1 mb-6 text-sm">
        Practise past HSC questions with instant feedback.
      </p>
      <AuthForm mode="sign-up" />
    </>
  );
}
