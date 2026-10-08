import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { ProfileForm } from "@/components/profile-form";
import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
export default async function Profile() {
  const p = await requireProfile();
  const db = await createClient();
  const [
    { data, error },
    {
      data: { user },
    },
  ] = await Promise.all([
    db
      .from("profiles")
      .select("full_name,year_level,school")
      .eq("id", p.id)
      .single(),
    db.auth.getUser(),
  ]);
  if (error) throw new Error("Could not load your profile.");
  return (
    <div className="space-y-7">
      <h1>
        Your <em>profile.</em>
      </h1>
      <ProfileForm profile={data} email={user?.email ?? ""} />
      <form action={signOut}>
        <Button variant="outline" type="submit">
          Sign out
        </Button>
      </form>
    </div>
  );
}
