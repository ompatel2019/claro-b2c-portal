import Link from "next/link";
export function HomeworkStages({
  setId,
  title,
  stage,
  right,
  cards,
  answered,
  questions,
  onReview,
  onQuestions,
  disabled,
}: {
  setId: string;
  title: string;
  stage: 1 | 2 | 3;
  right: number;
  cards: number;
  answered: number;
  questions: number;
  onReview?: () => void;
  onQuestions?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-4">
      <p className="eyebrow">Homework</p>
      <h1 className="text-2xl sm:text-3xl">{title}</h1>
      <nav aria-label="Homework stages" className="flex flex-wrap gap-3">
        <span className="chip" aria-current={stage === 1 ? "step" : undefined}>
          01 Flashcards ({right} of {cards} right)
        </span>
        {right === cards && onQuestions ? (
          <button
            disabled={disabled}
            className="chip min-h-11 underline"
            onClick={onQuestions}
            aria-current={stage === 2 ? "step" : undefined}
          >
            02 Questions ({answered} of {questions})
          </button>
        ) : right === cards ? (
          <Link
            prefetch={false}
            className="chip min-h-11 underline"
            aria-current={stage === 2 ? "step" : undefined}
            href={`/homework/${setId}/do?stage=questions`}
          >
            02 Questions ({answered} of {questions})
          </Link>
        ) : (
          <span className="chip" aria-disabled="true">
            02 Questions ({answered} of {questions}) · Locked
          </span>
        )}
        {onReview ? (
          <button
            className="chip min-h-11 underline"
            disabled={disabled}
            onClick={onReview}
            aria-current={stage === 3 ? "step" : undefined}
          >
            03 Review
          </button>
        ) : (
          <span className="chip" aria-disabled="true">
            03 Review · Locked
          </span>
        )}
      </nav>
    </div>
  );
}
