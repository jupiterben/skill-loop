import { useState } from "react";
import { Button, Input, List, Modal, Space, Typography } from "antd";
import { Modal as LoopModal } from "./Modal";

const { Text } = Typography;
const { TextArea } = Input;

interface Props {
  patterns?: string[];
  busy?: boolean;
  onAdd?: (content: string) => Promise<void>;
  onUpdate?: (index: number, content: string) => Promise<void>;
  onDelete?: (index: number) => Promise<void>;
}

export function Patterns({
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
        <Text type="secondary" className="patterns-panel__empty">
          暂无模式记录
        </Text>
      ) : (
        <List
          className="pattern-list"
          size="small"
          dataSource={patterns}
          renderItem={(p, i) => (
            <List.Item
              key={`${i}-${p.slice(0, 24)}`}
              className="pattern-list__item"
              actions={
                canMutate
                  ? [
                      <Button
                        key="edit"
                        type="link"
                        size="small"
                        disabled={busy}
                        onClick={() => openEdit(i)}
                      >
                        编辑
                      </Button>,
                      <Button
                        key="delete"
                        type="link"
                        size="small"
                        danger
                        disabled={busy}
                        onClick={() => confirmDelete(i)}
                      >
                        删除
                      </Button>,
                    ]
                  : undefined
              }
            >
              <Text className="pattern-list__text">{p}</Text>
            </List.Item>
          )}
        />
      )}

      <LoopModal open={addOpen} title="新增 Pattern" onClose={closeAdd}>
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <TextArea
            rows={4}
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
            rows={4}
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
