import { ProjectMetaEditor, type ProjectMetaDraft } from "./ProjectMetaEditor";
import { SidebarCollapse } from "../../components/SidebarCollapse";
import type { ProjectStatus } from "../../types";

const STORAGE_KEY = "loop-project-meta-panel-open";

interface Props {
  status: ProjectStatus;
  busy?: boolean;
  onSave?: (draft: ProjectMetaDraft) => Promise<void>;
}

export function ProjectMetaPanel({ status, busy, onSave }: Props) {
  const filled =
    Boolean(status.description.trim()) || Boolean(status.vision?.trim());

  return (
    <SidebarCollapse
      storageKey={STORAGE_KEY}
      defaultOpen
      title="项目元信息"
      count={filled ? 1 : 0}
      className="project-meta-panel"
    >
      <ProjectMetaEditor status={status} busy={busy} onSave={onSave} />
    </SidebarCollapse>
  );
}
