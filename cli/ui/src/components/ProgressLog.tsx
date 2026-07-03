import type { ProgressEntry } from "../types";

interface Props {
  entries?: ProgressEntry[];
}

export function ProgressLog({ entries = [] }: Props) {
  if (!entries.length) {
    return <p className="muted">暂无记录</p>;
  }

  return (
    <>
      {entries.map((e) => (
        <article key={e.id ?? `${e.entryDate}-${e.storyId}`} className="progress-entry">
          <h3>
            {e.entryDate}
            {e.storyId ? ` · ${e.storyId}` : ""}
          </h3>
          <p className="summary">{e.summary}</p>
          {e.learnings?.length > 0 && (
            <ul className="learnings">
              {e.learnings.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </>
  );
}
