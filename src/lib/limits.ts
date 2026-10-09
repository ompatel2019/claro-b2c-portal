export const OWN_FLASHCARD_LIMIT = 2_000;
export const CARD_IMPORT_ROW_LIMIT = 500;
export const CARD_IMPORT_BYTE_LIMIT = 1_048_576;
export const MARK_MY_ANSWER_DAILY_LIMIT = 20;
export const WRITTEN_WORD_LIMIT = 3_000;
export const WRITTEN_WORD_WARNING = 2_500;
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
