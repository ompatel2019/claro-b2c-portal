import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";

/** Stimulus upload; storage also enforces admin-only writes and the MIME/size limit. */
export async function POST(request: Request) {
  await requireAdmin();
  const form = await request.formData().catch(() => null);
  const file = form?.get("image");
  if (
    !(file instanceof File) ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    !file.size ||
    file.size > 10 * 1024 * 1024
  )
    return Response.json(
      { error: "Choose a JPEG, PNG or WebP image up to 10 MB." },
      { status: 400 },
    );
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[
    file.type
  ];
  const path = `${crypto.randomUUID()}.${ext}`;
  const db = await createClient();
  const { error } = await db.storage
    .from("question-images")
    .upload(path, file, { contentType: file.type });
  if (error)
    return Response.json(
      { error: "Couldn't upload this image. Try again." },
      { status: 500 },
    );
  return Response.json({
    url: db.storage.from("question-images").getPublicUrl(path).data.publicUrl,
  });
}
