import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { ProfileForm } from "@/components/profile-form";
import { PasswordForm } from "@/components/password-form";
import { signOut } from "@/app/(auth)/actions";
import { signOutEverywhere } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
export default async function Profile() {
  const p = await requireProfile();
  const db = await createClient();
  const [{ data, error }, userResult, claimsResult] = await Promise.all([
    db
      .from("profiles")
      .select("full_name,year_level,school")
      .eq("id", p.id)
      .single(),
    db.auth.getUser(),
    db.auth.getClaims(),
  ]);
  if (error) throw new Error("Could not load your profile.");
  const email =
    userResult.data.user?.email ??
    (typeof claimsResult.data?.claims?.email === "string"
      ? claimsResult.data.claims.email
      : "");
  return (
    <div className="space-y-7">
      <h1>
        Your <em>profile.</em>
      </h1>
      <ProfileForm profile={data} email={email} />
      <PasswordForm />
      <div className="flex flex-wrap gap-3">
        <form action={signOut}>
          <Button variant="outline" type="submit">
            Sign out
          </Button>
        </form>
        <form action={signOutEverywhere}>
          <Button variant="outline" type="submit">
            Sign out everywhere
          </Button>
        </form>
      </div>
    </div>
  );
}
