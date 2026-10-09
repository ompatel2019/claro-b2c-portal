"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { saveProfile, type FormState } from "@/app/(app)/actions";
import { PageStatus } from "@/components/page-status";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

export function WelcomeDialog({
  profile,
}: {
  profile: { full_name: string | null; school: string | null };
}) {
  const [name, setName] = useState(profile.full_name ?? "");
  const [school, setSchool] = useState(profile.school ?? "");
  const [year, setYear] = useState<string | null>(null);
  const [state, action, pending] = useActionState(
    async (previous: FormState, form: FormData) => {
      try {
        return await saveProfile(previous, form);
      } catch {
        return { error: "Couldn't save this." };
      }
    },
    {},
  );
  return (
    <Dialog
      open
      disablePointerDismissal
      onOpenChange={(_, details) => details.cancel()}
    >
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border shadow-none"
      >
        <DialogTitle>Welcome</DialogTitle>
        <DialogDescription>Choose your year to get started.</DialogDescription>
        <PageStatus>
          <form action={action} className="min-w-0 space-y-4">
            <input type="hidden" name="welcome" value="true" />
            <fieldset disabled={pending} className="min-w-0 space-y-4">
              <FormField
                label="Full name"
                error={state.fieldErrors?.full_name?.[0]}
              >
                <Input
                  name="full_name"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  minLength={2}
                  maxLength={80}
                />
              </FormField>
              <Select
                name="year_level"
                value={year}
                onValueChange={setYear}
                required
                disabled={pending}
                items={{ "11": "Year 11", "12": "Year 12" }}
              >
                <FormField
                  label="Year"
                  error={state.fieldErrors?.year_level?.[0]}
                >
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue placeholder="Choose your year" />
                  </SelectTrigger>
                </FormField>
                <SelectContent>
                  <SelectItem value="11">Year 11</SelectItem>
                  <SelectItem value="12">Year 12</SelectItem>
                </SelectContent>
              </Select>
              <FormField
                label="School"
                hint="Optional"
                error={state.fieldErrors?.school?.[0]}
              >
                <Input
                  name="school"
                  autoComplete="organization"
                  value={school}
                  onChange={(event) => setSchool(event.target.value)}
                  maxLength={120}
                />
              </FormField>
            </fieldset>
            {state.error && !state.fieldErrors && (
              <p role="alert" className="text-destructive text-sm break-words">
                {state.error}
                {!state.sessionExpired && " Try again."}
              </p>
            )}
            {state.sessionExpired ? (
              <Link href="/sign-in" className="text-primary text-sm underline">
                Sign in again
              </Link>
            ) : (
              <Button type="submit" disabled={pending} className="w-full">
                {pending ? "Saving…" : "Let's go"}
              </Button>
            )}
          </form>
        </PageStatus>
      </DialogContent>
    </Dialog>
  );
}
