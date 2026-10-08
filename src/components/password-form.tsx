"use client";
import { useActionState } from "react";
import { changePassword } from "@/app/(app)/actions";
import { Button } from "./ui/button";
export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, {});
  return (
    <form action={action} className="panel max-w-xl space-y-4">
      <h2>Change password</h2>
      <label className="grid gap-2">
        New password
        <input
          className="field"
          type="password"
          name="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </label>
      <label className="grid gap-2">
        Confirm new password
        <input
          className="field"
          type="password"
          name="confirm"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </label>
      {state.error && (
        <p role="alert" className="text-destructive">
          {state.error}
        </p>
      )}
      {state.message && <p role="status">{state.message}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
