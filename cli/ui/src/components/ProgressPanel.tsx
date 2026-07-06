import { Typography } from "antd";
import type { ProgressEntry } from "../types";
import { CollapsiblePanel } from "./CollapsiblePanel";

const { Text } = Typography;

const STORAGE_KEY = "loop-progress-panel-open";

function ProgressList({ entries }: { entries: ProgressEntry[] }) {
  if (!entries.length) {
    return (
      <Text type="secondary" className="panel-accordion__empty">
        暂无进度记录
      </Text>
    );
  }

  const sorted = [...entries].sort((a, b) =>
    b.entryDate.localeCompare(a.entryDate)
  );

  return (
    <div className="progress-panel__list">
      {sorted.map((e) => (
        <article
          key={e.id ?? `${e.entryDate}-${e.storyId}`}
          className="progress-panel__entry"
        >
          <Text className="progress-panel__date">
            {e.entryDate}
            {e.storyId ? ` · ${e.storyId}` : ""}
          </Text>
          <p className="progress-panel__summary">{e.summary}</p>
          {e.learnings?.length > 0 && (
            <ul className="progress-panel__learnings">
              {e.learnings.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </div>
  );
}

interface Props {
  progress: ProgressEntry[];
}

export function ProgressPanel({ progress }: Props) {
  return (
    <CollapsiblePanel
      storageKey={STORAGE_KEY}
      defaultOpen
      title="进度记录"
      count={progress.length}
      className="progress-panel"
    >
      <ProgressList entries={progress} />
    </CollapsiblePanel>
  );
}
