import { loadHomeworkList } from "@/lib/homework-data";
import { HomeworkCard } from "@/components/homework-card";
export default async function Homework() {
  const { sets, sessions } = await loadHomeworkList();
  const sessionFor = (id: string) =>
    sessions.find((s) => s.homework_set_id === id);
  const nearest = sets.find((s) => !sessionFor(s.id)?.finished_at);
  const now = new Date().getTime();
  const todo = sets.filter(
    (s) =>
      !sessionFor(s.id)?.finished_at && new Date(s.due_at).getTime() >= now,
  );
  const past = sets.filter(
    (s) => sessionFor(s.id)?.finished_at || new Date(s.due_at).getTime() < now,
  );
  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">A little practice, every week</p>
        <h1>
          Your <em>homework.</em>
        </h1>
      </div>
      {!sets.length && (
        <p className="panel p-6">
          No homework has been set yet. Your published homework will appear
          here.
        </p>
      )}
      {nearest && (
        <HomeworkCard set={nearest} session={sessionFor(nearest.id)} hero />
      )}
      {[
        ["To do", todo],
        ["Past", past],
      ].map(([label, rows]) => (
        <section className="space-y-4" key={label as string}>
          <h2>{label as string}</h2>
          {(rows as typeof sets).length ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {(rows as typeof sets).map((set) => (
                <HomeworkCard
                  key={set.id}
                  set={set}
                  session={sessionFor(set.id)}
                />
              ))}
            </div>
          ) : (
            <p>No homework in this list.</p>
          )}
        </section>
      ))}
    </div>
  );
}
