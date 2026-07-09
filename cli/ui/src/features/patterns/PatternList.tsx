import { useState } from "react";
import { Button, Input, Modal, Space, Typography } from "antd";
import { Modal as LoopModal } from "../../components/Modal";
import { needsExpand, patternPreview } from "./patternPreview";

const { Text } = Typography;
const { TextArea } = Input;

interface Props {
  patterns?: string[];
  busy?: boolean;
  onAdd?: (content: string) => Promise<void>;
  onUpdate?: (index: number, content: string) => Promise<void>;
  onDelete?: (index: number) => Promise<void>;
}

export function PatternList({
  patterns = [],
  busy = false,
  onAdd,
  onUpdate,
  onDelete,
}: Props) {
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addValue, setAddValue] = useState("");
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const canMutate = Boolean(onAdd && onUpdate && onDelete);

  const openEdit = (index: number) => {
    setEditIndex(index);
    setEditValue(patterns[index] ?? "");
  };

  const closeEdit = () => {
    setEditIndex(null);
    setEditValue("");
  };

  const closeAdd = () => {
    setAddOpen(false);
    setAddValue("");
  };

  const submitEdit = async () => {
    const trimmed = editValue.trim();
    if (!trimmed || editIndex === null || !onUpdate) return;
    await onUpdate(editIndex, trimmed);
    closeEdit();
  };

  const submitAdd = async () => {
    const trimmed = addValue.trim();
    if (!trimmed || !onAdd) return;
    await onAdd(trimmed);
    closeAdd();
  };

  const confirmDelete = (index: number) => {
    if (!onDelete) return;
    Modal.confirm({
      title: "删除 Pattern",
      content: "确定删除这条 Codebase Pattern？",
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () => onDelete(index),
    });
  };

  const toggleExpand = (index: number) => {
    setExpanded((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  return (
    <div className="patterns-panel__body">
      {canMutate && (
        <Button
          type="dashed"
          size="small"
          block
          className="patterns-panel__add-btn"
          disabled={busy}
          onClick={() => setAddOpen(true)}
        >
          + 新增 Pattern
        </Button>
      )}

      {!patterns.length ? (
        <div className="patterns-panel__empty">
          <Text type="secondary">暂无模式记录</Text>
          <Text type="secondary" className="patterns-panel__empty-hint">
            Agent 完成 Story 后会自动写入可复用约定
          </Text>
        </div>
      ) : (
        <div className="pattern-card-list">
          {patterns.map((content, index) => {
            const isExpanded = expanded[index];
            const showExpand = needsExpand(content);
            const displayText = isExpanded ? content.trim() : patternPreview(content);

            return (
              <article
                key={`${index}-${content.slice(0, 24)}`}
                className="pattern-card"
              >
                <header className="pattern-card__head">
                  <span className="pattern-card__index">#{index + 1}</span>
                </header>
                <p className="pattern-card__content">{displayText}</p>
                {showExpand && (
                  <Button
                    type="link"
                    size="small"
                    className="pattern-card__expand"
                    onClick={() => toggleExpand(index)}
                  >
                    {isExpanded ? "收起" : "展开全文"}
                  </Button>
                )}
                {canMutate && (
                  <footer className="pattern-card__actions">
                    <Button
                      type="default"
                      size="small"
                      disabled={busy}
                      onClick={() => openEdit(index)}
                    >
                      编辑
                    </Button>
                    <Button
                      type="default"
                      size="small"
                      danger
                      disabled={busy}
                      onClick={() => confirmDelete(index)}
                    >
                      删除
                    </Button>
                  </footer>
                )}
              </article>
            );
          })}
        </div>
      )}

      <LoopModal open={addOpen} title="新增 Pattern" onClose={closeAdd}>
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <TextArea
            rows={6}
            value={addValue}
            placeholder="描述可复用的编码约定…"
            disabled={busy}
            onChange={(e) => setAddValue(e.target.value)}
          />
          <Space>
            <Button
              type="primary"
              disabled={busy || !addValue.trim()}
              onClick={() => void submitAdd()}
            >
              保存
            </Button>
            <Button disabled={busy} onClick={closeAdd}>
              取消
            </Button>
          </Space>
        </Space>
      </LoopModal>

      <LoopModal
        open={editIndex !== null}
        title="编辑 Pattern"
        onClose={closeEdit}
      >
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <TextArea
            rows={6}
            value={editValue}
            disabled={busy}
            onChange={(e) => setEditValue(e.target.value)}
          />
          <Space>
            <Button
              type="primary"
              disabled={busy || !editValue.trim()}
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
