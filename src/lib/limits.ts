export const OWN_FLASHCARD_LIMIT = 2_000;
export const CARD_IMPORT_ROW_LIMIT = 500;
export const CARD_IMPORT_BYTE_LIMIT = 1_048_576;
export const MARK_MY_ANSWER_DAILY_LIMIT = 20;
export const WRITTEN_WORD_LIMIT = 3_000;
export const WRITTEN_WORD_WARNING = 2_500;
/**
 * Typical answer length by marks. Longer answers earn about 35-50 words a mark (BRIEF); a 1-3 mark
 * "state / outline / identify" answer is much tighter, so it ramps up instead of scaling linearly.
 */
export function wordGuide(marks: number): [number, number] {
  const short: Record<number, [number, number]> = {
    1: [10, 20],
    2: [25, 45],
    3: [60, 90],
  };
  const m = Math.max(1, Math.round(marks));
  return short[m] ?? [m * 35, m * 50];
}
export const ANSWER_PHOTO_BYTE_LIMIT = 10 * 1024 * 1024;
export const SHORT_PHOTO_PAGE_LIMIT = 3;
export const LONG_PHOTO_PAGE_LIMIT = 8;
export const OPEN_DISPUTES_PER_ANSWER = 1;
export const OPEN_DISPUTES_PER_STUDENT = 3;

// Admin test marking uses the same typed-answer limits as student marking.
export {
  WRITTEN_WORD_LIMIT as TYPED_ANSWER_WORD_LIMIT,
  WRITTEN_WORD_WARNING as TYPED_ANSWER_WARNING_WORDS,
};

export const CARD_FRONT_LIMIT = 200;
export const CARD_BACK_LIMIT = 1_000;
