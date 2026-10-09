"use client";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { ProfileSignInDialog } from "./profile-form";
import { changePassword, type FormState } from "@/app/(app)/actions";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
export function PasswordForm() {
  const [expired, setExpired] = useState(false);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [state, action, pending] = useActionState<FormState, FormData>(
    async (previous, form) => {
      if (!navigator.onLine)
        return { error: "You're offline. Try again when you're back." };
      let result: FormState;
      try {
        result = await changePassword(previous, form);
      } catch {
        return { error: "Couldn't update your password. Try again" };
      }
      if (result.sessionExpired) setExpired(true);
      if (result.message) toast.success(result.message, { duration: 4000 });
      return result;
    },
    {},
  );
  return (
    <>
      <ProfileSignInDialog open={expired} onOpenChange={setExpired} />
      <Card className="min-w-0 p-5">
        <h2 className="text-base font-semibold">Password</h2>
        <form
          action={action}
          className="grid gap-4"
          aria-label="Password"
          noValidate
        >
          {(
            [
              ["current_password", "Current password"],
              ["password", "New password"],
              ["confirm", "Confirm"],
            ] as const
          ).map(([name, label]) => (
            <div key={name} className="grid gap-2">
              <Label htmlFor={name}>{label}</Label>
              <div className="flex min-w-0 gap-2">
                <Input
                  aria-invalid={!!state.fieldErrors?.[name]}
                  aria-describedby={
                    state.fieldErrors?.[name] ? `${name}-error` : undefined
                  }
                  id={name}
                  name={name}
                  type={visible[name] ? "text" : "password"}
                  autoComplete={
                    name === "current_password"
                      ? "current-password"
                      : "new-password"
                  }
                  required
                  disabled={pending}
                />
                <Button
                  type="button"
                  variant="outline"
                  aria-label={`${visible[name] ? "Hide" : "Show"} ${label.toLowerCase()}`}
                  aria-pressed={!!visible[name]}
                  onClick={() =>
                    setVisible({ ...visible, [name]: !visible[name] })
                  }
                >
                  {visible[name] ? "Hide" : "Show"}
                </Button>
              </div>
              {state.fieldErrors?.[name] && (
                <p id={`${name}-error`} className="text-destructive">
                  {state.fieldErrors[name]?.[0]}
                </p>
              )}
            </div>
          ))}
          {state.error && (
            <p
              id="password-form-error"
              role="alert"
              className="text-destructive"
            >
              {state.error}
            </p>
          )}
          <Button
            type="submit"
            className="justify-self-start"
            disabled={pending}
          >
            {pending ? "Updating…" : "Update password"}
          </Button>
        </form>
      </Card>
    </>
  );
}
