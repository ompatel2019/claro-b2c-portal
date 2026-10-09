"use client";
import { useActionState, useState, useEffect, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { ensureSession } from "@/lib/auth-client";
import { AuthForm } from "@/app/(auth)/auth-form";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { toast } from "sonner";
import { saveProfile, type FormState } from "@/app/(app)/actions";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "./ui/select";
export function ProfileSignInDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Sign in again</DialogTitle>
        <p>
          Your session expired. Your unsaved details are kept on this device.
        </p>
        <AuthForm mode="sign-in" next="/student/profile" />
      </DialogContent>
    </Dialog>
  );
}
export function ProfileForm({
  profile,
  email,
  userId,
}: {
  profile: {
    full_name: string | null;
    year_level: number | null;
    school: string | null;
  };
  email: string;
  userId: string;
}) {
  const initial = {
    full_name: profile.full_name ?? "",
    year_level: String(profile.year_level ?? ""),
    school: profile.school ?? "",
  };
  const formRef = useRef<HTMLFormElement>(null);
  const wasOffline = useRef(false);
  const [values, setValues] = useState(initial);
  const [offline, setOffline] = useState(false);
  const [expired, setExpired] = useState(false);
  const [restored, setRestored] = useState(false);
  const draftKey = `claro:profile:${userId}`;
  useEffect(() => {
    const online = () => setOffline(!navigator.onLine);
    online();
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const draft = JSON.parse(localStorage.getItem(draftKey) ?? "null");
        if (
          draft &&
          typeof draft.full_name === "string" &&
          typeof draft.school === "string" &&
          ["", "11", "12"].includes(draft.year_level)
        )
          setValues(draft);
      } catch {
        /* Storage may be unavailable. */
      }
      setRestored(true);
    });
    const { data } = createClient().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setExpired(true);
      if (event === "SIGNED_IN") setExpired(false);
    });
    return () => {
      active = false;
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
      data.subscription.unsubscribe();
    };
  }, [draftKey]);
  const [saved, setSaved] = useState(initial);
  const changed = Object.keys(values).some(
    (k) => values[k as keyof typeof values] !== saved[k as keyof typeof saved],
  );
  useEffect(() => {
    if (!restored) return;
    try {
      if (changed) localStorage.setItem(draftKey, JSON.stringify(values));
      else localStorage.removeItem(draftKey);
    } catch {
      /* Keep the draft in memory. */
    }
  }, [values, draftKey, restored, changed]);
  const [state, action, pending] = useActionState<FormState, FormData>(
    async (previous, form) => {
      try {
        await ensureSession(createClient());
      } catch {
        setExpired(true);
        return { error: "Your session expired. Sign in again." };
      }
      let result: FormState;
      try {
        result = await saveProfile(previous, form);
      } catch {
        return { error: "Couldn't save your details. Try again" };
      }
      if (result.sessionExpired) setExpired(true);
      if (result.message) {
        const next = {
          full_name: String(form.get("full_name")).trim(),
          year_level: String(form.get("year_level")),
          school: String(form.get("school")).trim(),
        };
        setSaved(next);
        setValues(next);
        toast.success("Saved", { duration: 4000 });
      }
      return result;
    },
    {},
  );
  useEffect(() => {
    const reconnected = wasOffline.current && !offline;
    wasOffline.current = offline;
    if (reconnected && restored && changed && !pending && !expired)
      formRef.current?.requestSubmit();
  }, [offline, restored, changed, pending, expired]);
  return (
    <>
      {offline && (
        <p role="status" className="rounded-lg border px-3 py-2 text-sm">
          {"You're offline. We'll save when you're back."}
        </p>
      )}
      <ProfileSignInDialog open={expired} onOpenChange={setExpired} />
      <Card className="min-w-0 p-5">
        <h2 className="text-base font-semibold">Details</h2>
        <form
          ref={formRef}
          action={action}
          className="grid min-w-0 gap-4"
          aria-label="Details"
        >
          <div className="grid gap-2">
            <Label htmlFor="full_name">Full name</Label>
            <Input
              aria-invalid={!!state.fieldErrors?.full_name}
              aria-describedby={
                state.fieldErrors?.full_name ? "full_name-error" : undefined
              }
              id="full_name"
              name="full_name"
              value={values.full_name}
              onChange={(e) =>
                setValues({ ...values, full_name: e.target.value })
              }
              required
              minLength={2}
              maxLength={80}
              autoComplete="name"
              disabled={pending}
            />
            {state.fieldErrors?.full_name && (
              <p id="full_name-error" className="text-destructive">
                {state.fieldErrors.full_name[0]}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="year_level">Year</Label>
            <Select
              name="year_level"
              value={values.year_level}
              onValueChange={(v) =>
                setValues({ ...values, year_level: v ?? "" })
              }
              disabled={pending}
            >
              <SelectTrigger
                aria-invalid={!!state.fieldErrors?.year_level}
                aria-describedby={
                  state.fieldErrors?.year_level ? "year_level-error" : undefined
                }
                id="year_level"
                className="h-9 w-full"
              >
                <SelectValue placeholder="Choose your year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="11">Year 11</SelectItem>
                <SelectItem value="12">Year 12</SelectItem>
              </SelectContent>
            </Select>
            {state.fieldErrors?.year_level && (
              <p id="year_level-error" className="text-destructive">
                {state.fieldErrors.year_level[0]}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="school">
              School <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              aria-invalid={!!state.fieldErrors?.school}
              aria-describedby={
                state.fieldErrors?.school ? "school-error" : undefined
              }
              id="school"
              name="school"
              value={values.school}
              onChange={(e) => setValues({ ...values, school: e.target.value })}
              maxLength={120}
              disabled={pending}
            />
            {state.fieldErrors?.school && (
              <p id="school-error" className="text-destructive">
                {state.fieldErrors.school[0]}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              value={email}
              readOnly
              type="email"
              autoComplete="email"
            />
          </div>
          {state.error && (
            <p id="details-error" role="alert" className="text-destructive">
              {state.error}
            </p>
          )}
          <Button
            type="submit"
            className="justify-self-start"
            disabled={!changed || pending || offline || !restored}
          >
            {pending ? "Saving…" : "Save"}
          </Button>
        </form>
      </Card>
    </>
  );
}
