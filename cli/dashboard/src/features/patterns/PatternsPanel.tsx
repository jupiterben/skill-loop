import { CollapsiblePanel } from "../../components/CollapsiblePanel";
import { PatternList } from "./PatternList";

const STORAGE_KEY = "loop-patterns-panel-open";

interface Props {
  patterns: string[];
  busy?: boolean;
  onAdd?: (content: string) => Promise<void>;
  onUpdate?: (index: number, content: string) => Promise<void>;
  onDelete?: (index: number) => Promise<void>;
}

export function PatternsPanel({
  patterns,
  busy,
  onAdd,
  onUpdate,
  onDelete,
}: Props) {
  return (
    <CollapsiblePanel
      storageKey={STORAGE_KEY}
      defaultOpen
      title="Codebase Patterns"
      count={patterns.length}
      className="patterns-panel"
      bodyClassName="patterns-panel__scroll"
    >
      <PatternList
        patterns={patterns}
        busy={busy}
        onAdd={onAdd}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    </CollapsiblePanel>
  );
}
