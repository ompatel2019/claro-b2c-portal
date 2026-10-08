"use client";
import { useActionState } from "react";
import { saveProfile } from "@/app/(app)/actions";
import { Button } from "./ui/button";
export function ProfileForm({
  profile,
  email,
}: {
  profile: {
    full_name: string | null;
    year_level: number | null;
    school: string | null;
  };
  email: string;
}) {
  const [state, action, pending] = useActionState(saveProfile, {});
  return (
    <form action={action} className="panel max-w-xl space-y-4">
      <label className="grid gap-2">
        Email
        <input className="field" value={email} readOnly type="email" />
      </label>
      <label className="grid gap-2">
        Full name
        <input
          className="field"
          name="full_name"
          defaultValue={profile.full_name ?? ""}
          required
          maxLength={100}
        />
      </label>
      <label className="grid gap-2">
        Year level
        <select
          className="field"
          name="year_level"
          defaultValue={profile.year_level ?? ""}
        >
          <option value="">Choose your year</option>
          <option value="11">Year 11</option>
          <option value="12">Year 12</option>
        </select>
      </label>
      <label className="grid gap-2">
        School
        <input
          className="field"
          name="school"
          defaultValue={profile.school ?? ""}
          maxLength={200}
        />
      </label>
      {state.error && (
        <p role="alert" className="text-destructive">
          {state.error}
        </p>
      )}
      {state.message && <p role="status">{state.message}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
