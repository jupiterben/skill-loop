import { Input, Tooltip } from "antd";
import { memo, useLayoutEffect, useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { MindMapNodeData } from "../lib/mindmapLayout";

const DEP_HANDLE_H = 7;
const DEP_HANDLE_GAP = 4;
const DEP_HANDLE_FALLBACK_H = 54;

/** React Flow 右侧 handle 的 top 对应垂直中心（translate Y -50%） */
function depHandleTops(height: number): { inTop: number; outTop: number } {
  const mid = height / 2;
  const offset = (DEP_HANDLE_H + DEP_HANDLE_GAP) / 2;
  const minCenter = DEP_HANDLE_H / 2 + 2;
  const maxCenter = height - DEP_HANDLE_H / 2 - 2;

  let inTop = mid - offset;
  let outTop = mid + offset;

  if (inTop < minCenter || outTop > maxCenter) {
    const maxOffset = Math.min(mid - minCenter, maxCenter - mid);
    const clampedOffset = Math.min(offset, Math.max(maxOffset, 0));
    inTop = mid - clampedOffset;
    outTop = mid + clampedOffset;
  }

  return { inTop, outTop };
}

function isStoryNode(kind: MindMapNodeData["kind"]) {
  return (
    kind === "story" ||
    kind === "draft" ||
    kind === "blocked" ||
    kind === "done" ||
    kind === "pending_removal"
  );
}

function MindMapNode({ id, data, selected }: NodeProps) {
  const d = data as MindMapNodeData;
  const rootRef = useRef<HTMLDivElement>(null);
  const [nodeHeight, setNodeHeight] = useState(0);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(d.label);
  const showDescTooltip = isStoryNode(d.kind) && Boolean(d.description);
  const depTops = depHandleTops(nodeHeight || DEP_HANDLE_FALLBACK_H);
  const canRename = d.kind === "feature" && Boolean(d.onRenameTitle);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const report = () => {
      const h = Math.ceil(el.offsetHeight);
      if (h > 0) {
        setNodeHeight(h);
        d.onHeightChange?.(id, h);
      }
    };

    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [
    id,
    d.label,
    d.sublabel,
    d.storyId,
    d.kind,
    d.addable,
    d.showDepHandles,
    d.isRunning,
    d.onHeightChange,
  ]);

  useLayoutEffect(() => {
    if (!renaming) setRenameValue(d.label);
  }, [d.label, renaming]);

  const submitRename = () => {
    const next = renameValue.trim();
    setRenaming(false);
    if (!next || next === d.label) {
      setRenameValue(d.label);
      return;
    }
    d.onRenameTitle?.(next);
  };

  const nodeBody = (
    <div
      ref={rootRef}
      className={`mm-node mm-node--${d.kind}${d.isRunning ? " mm-node--running" : ""}${selected ? " mm-node--selected" : ""}${showDescTooltip ? " mm-node--has-desc" : ""}${d.isDropTarget ? " mm-node--drop-target" : ""}${d.isDragging ? " mm-node--dragging" : ""}`}
    >
        {d.isRunning && (
          <span className="mm-node__running-badge" aria-hidden>
            执行中
          </span>
        )}
        <Handle
          type="target"
          position={Position.Left}
          className="mm-handle"
          isConnectable={false}
        />
        {d.collapsible && (
          <Tooltip
            title={
              d.collapsed
                ? `展开 ${d.childCount ?? 0} 项`
                : "收起子节点"
            }
            placement="top"
            mouseEnterDelay={0.35}
            destroyOnHidden
          >
            <button
              type="button"
              className="mm-node__toggle"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                d.onToggleCollapse?.();
              }}
            >
              <span className="mm-node__toggle-icon">{d.collapsed ? "▸" : "▾"}</span>
              {d.collapsed && (d.childCount ?? 0) > 0 && (
                <span className="mm-node__toggle-count">{d.childCount}</span>
              )}
            </button>
          </Tooltip>
        )}
        {d.sublabel && <div className="mm-node__sublabel">{d.sublabel}</div>}
        {d.storyId ? (
          <div className="mm-node__label mm-node__label--story">
            <span className="mm-node__id">{d.storyId}</span>
            <span className="mm-node__title">{d.label}</span>
          </div>
        ) : renaming && canRename ? (
          <Input
            size="small"
            className="mm-node__rename-input"
            value={renameValue}
            autoFocus
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={submitRename}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") submitRename();
              if (e.key === "Escape") {
                setRenameValue(d.label);
                setRenaming(false);
              }
            }}
          />
        ) : (
          <div
            className={`mm-node__label${canRename ? " mm-node__label--renamable" : ""}`}
            title={canRename ? "双击改名" : undefined}
            onDoubleClick={
              canRename
                ? (e) => {
                    e.stopPropagation();
                    setRenameValue(d.label);
                    setRenaming(true);
                  }
                : undefined
            }
          >
            {d.label}
          </div>
        )}
        {d.addable && (
          <div
            className="mm-node__actions"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="mm-node__action"
              onClick={(e) => {
                e.stopPropagation();
                d.onAddFeature?.();
              }}
            >
              + Feature
            </button>
            <button
              type="button"
              className="mm-node__action"
              onClick={(e) => {
                e.stopPropagation();
                d.onAddStory?.();
              }}
            >
              + Story
            </button>
          </div>
        )}
        {d.confirmable && (
          <div
            className="mm-node__actions mm-node__actions--confirm"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="mm-node__action mm-node__action--confirm"
              onClick={(e) => {
                e.stopPropagation();
                d.onConfirmDraft?.();
              }}
            >
              确认可执行
            </button>
          </div>
        )}
        {d.unconfirmable && (
          <div
            className="mm-node__actions mm-node__actions--confirm"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="mm-node__action"
              onClick={(e) => {
                e.stopPropagation();
                d.onUnconfirmDraft?.();
              }}
            >
              退回草稿
            </button>
          </div>
        )}
        <Handle
          type="source"
          position={Position.Right}
          id="tree"
          className="mm-handle"
          isConnectable={false}
        />
        {d.showDepHandles && (
          <>
            <Handle
              type="source"
              position={Position.Right}
              id="dep-out"
              className="mm-handle mm-handle--dep-out"
              isConnectableStart
              isConnectableEnd={false}
              title="出点：拖到其他 Story 入点"
              style={{ top: depTops.outTop, bottom: "auto" }}
            />
            <Handle
              type="target"
              position={Position.Right}
              id="dep-in"
              className="mm-handle mm-handle--dep-in"
              isConnectableStart={false}
              isConnectableEnd
              title="入点：接收依赖"
              style={{ top: depTops.inTop, bottom: "auto" }}
            />
          </>
        )}
    </div>
  );

  if (!showDescTooltip) return nodeBody;

  return (
    <Tooltip
      title={d.description}
      placement="top"
      mouseEnterDelay={0.2}
      destroyOnHidden
      styles={{ body: { maxWidth: 280, whiteSpace: "pre-wrap" } }}
    >
      {nodeBody}
    </Tooltip>
  );
}

export default memo(MindMapNode, (prev, next) => {
  const pd = prev.data as MindMapNodeData;
  const nd = next.data as MindMapNodeData;
  return (
    prev.id === next.id &&
    prev.selected === next.selected &&
    pd.kind === nd.kind &&
    pd.label === nd.label &&
    pd.isRunning === nd.isRunning &&
    pd.collapsed === nd.collapsed &&
    pd.addable === nd.addable &&
    pd.confirmable === nd.confirmable &&
    pd.showDepHandles === nd.showDepHandles &&
    pd.canMoveUp === nd.canMoveUp &&
    pd.canMoveDown === nd.canMoveDown &&
    pd.isDropTarget === nd.isDropTarget &&
    pd.isDragging === nd.isDragging
  );
});
