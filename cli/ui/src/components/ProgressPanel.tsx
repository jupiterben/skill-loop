import { Typography } from "antd";
import { sortProgressEntries } from "../features/progress/sortProgressEntries";
import type { ProgressEntry } from "../types";
import { CollapsiblePanel } from "./CollapsiblePanel";

const { Text } = Typography;

function ProgressList({ entries }: { entries: ProgressEntry[] }) {
  if (!entries.length) {
    return (
      <div className="progress-panel__empty">
        <Text type="secondary">暂无进度记录</Text>
        <Text type="secondary" className="progress-panel__empty-hint">
          Agent 完成 Story 后会自动写入
        </Text>
      </div>
    );
  }

  const sorted = sortProgressEntries(entries);

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
  /** 独占右侧面板时使用，不再折叠 */
  standalone?: boolean;
}

export function ProgressPanel({ progress, standalone = false }: Props) {
  if (standalone) {
    return (
      <div className="progress-panel progress-panel--standalone">
        <header className="progress-panel__head">
          <div className="progress-panel__title-wrap">
            <span className="progress-panel__icon" aria-hidden>
              ◷
            </span>
            <h3 className="progress-panel__title">进度记录</h3>
          </div>
          <span className="progress-panel__count">{progress.length}</span>
        </header>
        <div className="progress-panel__body">
          <ProgressList entries={progress} />
        </div>
      </div>
    );
  }

  return (
    <CollapsiblePanel
      storageKey="loop-progress-panel-open"
      defaultOpen
      title="进度记录"
      count={progress.length}
      className="progress-panel"
    >
      <ProgressList entries={progress} />
    </CollapsiblePanel>
  );
}
