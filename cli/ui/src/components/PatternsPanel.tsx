import { Patterns } from "./Patterns";
import { SidebarCollapse } from "./SidebarCollapse";

const STORAGE_KEY = "loop-patterns-panel-open";

interface Props {
  patterns: string[];
}

export function PatternsPanel({ patterns }: Props) {
  return (
    <SidebarCollapse
      storageKey={STORAGE_KEY}
      defaultOpen
      title="Codebase Patterns"
      count={patterns.length}
      className="patterns-panel"
    >
      <Patterns patterns={patterns} />
    </SidebarCollapse>
  );
}
