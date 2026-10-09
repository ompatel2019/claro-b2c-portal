"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { sydneyToday, type FlashcardConfig } from "@/lib/flashcards";
import {
  deckSchema,
  DECK_DEFAULTS,
  selectDeck,
  type DeckConfig,
} from "@/lib/deck";
import { loadDeckBank } from "@/lib/flashcard-data";
import { updateFlashcardProgress } from "@/lib/flashcard-progress";
import type { FormState } from "../actions";

export async function startFlashcards(
  _: FormState,
  form: FormData,
): Promise<FormState> {
  const profile = await requireProfile();
  if (profile.role !== "student") redirect("/admin");
  let configInput: unknown;
  const raw = form.get("config");
  const legacyIds = raw === null ? form.getAll("card_ids") : [];
  if (raw !== null) {
    try {
      configInput = JSON.parse(String(raw));
    } catch {
      return { error: "Choose a valid deck setup." };
    }
  } else {
    const legacy = z
      .object({
        ids: z.array(z.string().min(1).max(200)).max(200),
      })
      .safeParse({
        ids: legacyIds,
      });
    if (!legacy.success) return { error: "Choose a valid deck setup." };
    configInput = {
      ...DECK_DEFAULTS,
      size: legacyIds.length ? "all" : DECK_DEFAULTS.size,
      which: form.get("due") === "1" ? "due" : "all",
    };
  }
  const parsed = deckSchema.safeParse(configInput);
  if (!parsed.success) return { error: "Choose a valid deck setup." };
  const setup: DeckConfig = parsed.data;
  const db = await createClient();
  let loaded: Awaited<ReturnType<typeof loadDeckBank>>;
  try {
    loaded = await loadDeckBank(db, profile.id);
  } catch {
    return { error: "Could not load this deck. Please try again." };
  }
  const { cards, progress } = loaded;
  // Legacy retry IDs are only a filter on the authorised live bank. JSON config IDs are ignored.
  const bank = cards.filter(
    (c) => !legacyIds.length || legacyIds.includes(c.id),
  );
  const selected = selectDeck(bank, setup, {
    userId: profile.id,
    today: sydneyToday(),
    progress,
  });
  if (!selected.length)
    return {
      error:
        setup.which === "due"
          ? "Nothing is due yet. Start a deck below."
          : "No cards match this selection. Try another deck or card type.",
    };
  const config: FlashcardConfig = {
    ...setup,
    card_ids: selected.map((c) => c.id),
  };
  const { data, error } = await db
    .from("sessions")
    .insert({ kind: "flashcards", config })
    .select("id")
    .single();
  if (error) return { error: "Could not start your deck. Please try again." };
  redirect(`/flashcards/${data.id}`);
}
export async function rateFlashcard(
  sessionId: string,
  cardId: string,
  mark: number,
) {
  const parsed = z
    .object({
      sessionId: z.uuid(),
      cardId: z.string().min(1).max(200),
      mark: z.union([z.literal(0), z.literal(0.5), z.literal(1)]),
    })
    .safeParse({ sessionId, cardId, mark });
  if (!parsed.success) throw new Error("Choose a valid card rating.");
  const profile = await requireProfile();
  if (profile.role !== "student") throw new Error("Student access required.");
  const db = await createClient();
  const { data: session } = await db
    .from("sessions")
    .select("finished_at,config")
    .eq("id", sessionId)
    .eq("user_id", profile.id)
    .eq("kind", "flashcards")
    .maybeSingle()
    .throwOnError();
  if (!session || session.finished_at)
    throw new Error("This session was reset or expired. Start the deck again.");
  if (
    session.config.mode !== "study" ||
    !session.config.card_ids?.includes(cardId)
  )
    throw new Error("This card is not available in an active study session.");
  const { data: review } = await db
    .from("flashcard_reviews")
    .insert({
      session_id: sessionId,
      flashcard_id: cardId,
      answer: null,
      mark: parsed.data.mark,
      source: "self",
    })
    .select("id")
    .single()
    .throwOnError();
  await updateFlashcardProgress(
    db,
    profile.id,
    sessionId,
    cardId,
    review.id,
    parsed.data.mark,
  );
}
export async function saveFlashcardTime(sessionId: string, elapsed: number) {
  if (
    !z.uuid().safeParse(sessionId).success ||
    !Number.isInteger(elapsed) ||
    elapsed < 0 ||
    elapsed > 31536000
  )
    throw new Error("Invalid session time.");
  const profile = await requireProfile();
  const db = await createClient();
  await db
    .from("sessions")
    .update({ elapsed_s: elapsed })
    .eq("id", sessionId)
    .eq("user_id", profile.id)
    .eq("kind", "flashcards")
    .is("finished_at", null)
    .throwOnError();
}

/** Used by FlashcardPersistDrain. Returns missing when the session is gone. */
export async function drainPersistRating(item: {
  sessionId: string;
  cardId: string;
  mark: 0 | 0.5 | 1;
}): Promise<"ok" | "missing" | "error"> {
  const parsed = z
    .object({
      sessionId: z.uuid(),
      cardId: z.string().min(1).max(200),
      mark: z.union([z.literal(0), z.literal(0.5), z.literal(1)]),
    })
    .safeParse(item);
  if (!parsed.success) return "error";
  const profile = await requireProfile();
  if (profile.role !== "student") return "error";
  const db = await createClient();
  const { data: session } = await db
    .from("sessions")
    .select("id,finished_at")
    .eq("id", parsed.data.sessionId)
    .eq("user_id", profile.id)
    .eq("kind", "flashcards")
    .maybeSingle();
  if (!session || session.finished_at) return "missing";
  try {
    await rateFlashcard(
      parsed.data.sessionId,
      parsed.data.cardId,
      parsed.data.mark,
    );
    return "ok";
  } catch {
    // Re-check — session may have been deleted mid-flight.
    const { data: again } = await db
      .from("sessions")
      .select("id")
      .eq("id", parsed.data.sessionId)
      .eq("user_id", profile.id)
      .maybeSingle();
    return again ? "error" : "missing";
  }
}
