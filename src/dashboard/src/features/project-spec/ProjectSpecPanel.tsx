import { ProjectSpecEditor } from "./ProjectSpecEditor";
import { SidebarCollapse } from "../../components/SidebarCollapse";
import type { ProjectSpec, ProjectSpecTemplate } from "../../types";

const STORAGE_KEY = "loop-project-spec-panel-open";

interface Props {
  projectSpec: ProjectSpec;
  templates: ProjectSpecTemplate[];
  busy?: boolean;
  onSave?: (content: string) => Promise<void>;
  onApplyTemplate?: (templateId: string, append: boolean) => Promise<void>;
}

export function ProjectSpecPanel({
  projectSpec,
  templates,
  busy,
  onSave,
  onApplyTemplate,
}: Props) {
  const hasContent = Boolean(projectSpec.content.trim());

  return (
    <SidebarCollapse
      storageKey={STORAGE_KEY}
      defaultOpen
      title="项目规范"
      count={hasContent ? 1 : 0}
      className="project-spec-panel"
    >
      <ProjectSpecEditor
        projectSpec={projectSpec}
        templates={templates}
        busy={busy}
        onSave={onSave}
        onApplyTemplate={onApplyTemplate}
      />
    </SidebarCollapse>
  );
}
