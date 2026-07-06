import { Patterns } from "./Patterns";
import { SidebarCollapse } from "./SidebarCollapse";

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
    <SidebarCollapse
      storageKey={STORAGE_KEY}
      defaultOpen
      title="Codebase Patterns"
      count={patterns.length}
      className="patterns-panel"
    >
      <Patterns
        patterns={patterns}
        busy={busy}
        onAdd={onAdd}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    </SidebarCollapse>
  );
}
