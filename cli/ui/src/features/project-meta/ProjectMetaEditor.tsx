import { useEffect, useState } from "react";
import { Button, Form, Input, Typography } from "antd";
import type { ProjectStatus } from "../../types";

const { Text } = Typography;
const { TextArea } = Input;

export interface ProjectMetaDraft {
  branchName: string;
  description: string;
  vision: string;
}

interface Props {
  status: ProjectStatus;
  busy?: boolean;
  onSave?: (draft: ProjectMetaDraft) => Promise<void>;
}

function draftFromStatus(status: ProjectStatus): ProjectMetaDraft {
  return {
    branchName: status.branchName === "—" ? "" : status.branchName,
    description: status.description ?? "",
    vision: status.vision ?? "",
  };
}

export function ProjectMetaEditor({ status, busy = false, onSave }: Props) {
  const [branchName, setBranchName] = useState(
    () => draftFromStatus(status).branchName
  );
  const [description, setDescription] = useState(
    () => draftFromStatus(status).description
  );
  const [vision, setVision] = useState(() => draftFromStatus(status).vision);
  const canMutate = Boolean(onSave);

  const baseline = draftFromStatus(status);
  const dirty =
    branchName !== baseline.branchName ||
    description !== baseline.description ||
    vision !== baseline.vision;

  useEffect(() => {
    if (dirty) return;
    const next = draftFromStatus(status);
    setBranchName(next.branchName);
    setDescription(next.description);
    setVision(next.vision);
  }, [status.project, status.branchName, status.description, status.vision, dirty]);

  const submit = async () => {
    if (!onSave) return;
    await onSave({ branchName, description, vision });
  };

  return (
    <div className="project-meta-panel__body">
      <Form layout="vertical" size="small" className="project-meta-panel__form">
        <Form.Item label="项目名称">
          <Input value={status.project} disabled />
        </Form.Item>
        <Form.Item label="Git 分支">
          <Input
            value={branchName}
            disabled={!canMutate || busy}
            placeholder="main"
            onChange={(e) => setBranchName(e.target.value)}
          />
        </Form.Item>
        <Form.Item label="项目描述">
          <TextArea
            value={description}
            disabled={!canMutate || busy}
            placeholder="简要说明项目背景"
            autoSize={{ minRows: 2, maxRows: 4 }}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Form.Item>
        <Form.Item label="愿景 / 目标摘要">
          <TextArea
            value={vision}
            disabled={!canMutate || busy}
            placeholder="Agent 可参考的长期目标（可选）"
            autoSize={{ minRows: 2, maxRows: 5 }}
            onChange={(e) => setVision(e.target.value)}
          />
        </Form.Item>
      </Form>

      {canMutate && (
        <Button
          type="primary"
          size="small"
          block
          disabled={busy || !dirty || !branchName.trim()}
          loading={busy}
          onClick={() => void submit()}
        >
          保存元信息
        </Button>
      )}

      {!canMutate && (
        <Text type="secondary" className="project-meta-panel__hint">
          只读模式
        </Text>
      )}
    </div>
  );
}
