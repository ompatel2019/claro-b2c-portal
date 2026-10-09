import "server-only";
import { cache } from "react";
import { createClient } from "@/utils/supabase/server";
import { pages } from "./flashcard-data";
import { addDays, type ActivityDay } from "./activity";
import { sydneyToday } from "./flashcards";
import { rangeFrom, type ProgressRange, type ProgressData } from "./progress";

export const loadProgress = cache(
  async (range: ProgressRange, today: string): Promise<ProgressData> => {
    const db = await createClient();
    const { data, error } = await db.rpc("student_progress", {
      p_from: rangeFrom(range, today),
      p_to: today,
    });
    if (error || !data) throw new Error("Could not load progress");
    return data as ProgressData;
  },
);
export const loadProgressActivity = cache(
  async (userId: string, today: string) => {
    const db = await createClient();
    const [days, streaks] = await Promise.all([
      pages<ActivityDay>((from, to) =>
        db
          .rpc("activity_days", {
            p_user: userId,
            p_from: addDays(today, -371),
            p_to: today,
          })
          .order("day")
          .range(from, to),
      ),
      db.rpc("activity_streaks", { p_user: userId }).single(),
    ]);
    if (streaks.error) throw new Error("Could not load activity");
    const s = streaks.data as {
      current_streak: number;
      longest_streak: number;
    };
    return { days, ...s };
  },
);
// Sydney's day is shared by all cards in a request.
export const progressToday = cache(() => sydneyToday());
