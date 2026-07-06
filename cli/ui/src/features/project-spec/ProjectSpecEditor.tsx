import { useState } from "react";
import { Button, Input, Modal, Select, Space, Typography } from "antd";
import { Modal as LoopModal } from "../../components/Modal";
import type { ProjectSpec, ProjectSpecTemplate } from "../../types";

const { Text } = Typography;
const { TextArea } = Input;

interface Props {
  projectSpec: ProjectSpec;
  templates: ProjectSpecTemplate[];
  busy?: boolean;
  onSave?: (content: string) => Promise<void>;
  onApplyTemplate?: (templateId: string, append: boolean) => Promise<void>;
}

function preview(content: string, max = 160): string {
  const trimmed = content.trim();
  if (!trimmed) return "尚未编写项目规范";
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

export function ProjectSpecEditor({
  projectSpec,
  templates,
  busy = false,
  onSave,
  onApplyTemplate,
}: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const canMutate = Boolean(onSave && onApplyTemplate);

  const openEdit = () => {
    setEditValue(projectSpec.content);
    setEditOpen(true);
  };

  const closeEdit = () => {
    setEditOpen(false);
    setEditValue("");
  };

  const submitEdit = async () => {
    if (!onSave) return;
    await onSave(editValue);
    closeEdit();
  };

  const confirmApplyTemplate = () => {
    if (!onApplyTemplate || !templateId) return;
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    const hasContent = Boolean(projectSpec.content.trim());
    Modal.confirm({
      title: "应用规范模板",
      content: hasContent
        ? `将用「${template.title}」替换当前内容，是否继续？`
        : `将应用「${template.title}」模板，是否继续？`,
      okText: hasContent ? "替换" : "应用",
      cancelText: "取消",
      onOk: async () => {
        await onApplyTemplate(templateId, false);
        setTemplateId(null);
      },
    });
  };

  return (
    <div className="project-spec-panel__body">
      <Text type="secondary" className="project-spec-panel__preview">
        {preview(projectSpec.content)}
      </Text>

      {projectSpec.templateId && (
        <Text type="secondary" className="project-spec-panel__meta">
          当前模板：{projectSpec.templateId}
        </Text>
      )}

      {canMutate && (
        <Space direction="vertical" size="small" style={{ width: "100%" }}>
          <Button
            type="default"
            size="small"
            block
            disabled={busy}
            onClick={openEdit}
          >
            编辑规范
          </Button>

          <Select
            size="small"
            placeholder="选择规范模板"
            style={{ width: "100%" }}
            value={templateId}
            disabled={busy}
            onChange={setTemplateId}
            options={templates.map((t) => ({
              value: t.id,
              label: t.title,
            }))}
            optionRender={(opt) => {
              const t = templates.find((item) => item.id === opt.value);
              return (
                <div>
                  <div>{opt.label}</div>
                  {t?.description && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {t.description}
                    </Text>
                  )}
                </div>
              );
            }}
          />

          <Button
            type="dashed"
            size="small"
            block
            disabled={busy || !templateId}
            onClick={() => confirmApplyTemplate()}
          >
            应用模板
          </Button>
        </Space>
      )}

      <LoopModal open={editOpen} title="编辑项目规范" onClose={closeEdit}>
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <TextArea
            rows={12}
            value={editValue}
            placeholder="编写本项目的工程规范、协作约定…"
            disabled={busy}
            onChange={(e) => setEditValue(e.target.value)}
          />
          <Space>
            <Button
              type="primary"
              disabled={busy}
              onClick={() => void submitEdit()}
            >
              保存
            </Button>
            <Button disabled={busy} onClick={closeEdit}>
              取消
            </Button>
          </Space>
        </Space>
      </LoopModal>
    </div>
  );
}
