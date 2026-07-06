import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  type Connection,
  ConnectionMode,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeTypes,
  type OnEdgesDelete,
  type OnNodeDrag,
  type OnNodesDelete,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Button,
  Empty,
  Input,
  Segmented,
  Space,
  Splitter,
  Typography,
} from "antd";
import { ErrorAlert } from "./ErrorAlert";

import type {
  Feature,
  Milestone,
  ProgressEntry,
  SelectedMindMapNode,
  StoryDependency,
  TreeNode,
  UserStory,
} from "../types";
import { api } from "../lib/api";
import {
  buildProjectMindMap,
  depEdgeMarker,
  depEdgeStrokeColor,
  isDependencyEdge,
  type MindMapNodeData,
} from "../lib/mindmapLayout";
import { filterTreeByMilestone, MILESTONE_NONE, MILESTONE_NONE_LABEL } from "../lib/treeFilter";
import {
  DEFAULT_ACCEPTANCE_CRITERIA,
  formatAcceptanceCriteria,
  parseAcceptanceCriteria,
} from "../lib/acceptanceCriteria";
import { MilestoneChip } from "./MilestoneChip";
import {
  canDeleteFeature,
  canHardDeleteStory,
  isFormFieldFocused,
} from "../lib/deletable";
import MindMapNode from "./MindMapNode";
import DepEdge from "./DepEdge";
import { Modal } from "./Modal";
import { NodePropsPanel } from "./NodePropsPanel";
import { ProjectTreeView } from "./ProjectTreeView";
import {
  loadWorkspaceView,
  saveWorkspaceView,
  type WorkspaceView,
} from "../lib/treeViewData";
import { useSplitSizes } from "../hooks/useSplitSizes";
import { FitViewOnLoad } from "./FitViewOnLoad";
import {
  buildMindMapNavIndex,
  navigateMindMapNode,
  type NavDirection,
} from "../lib/mindmapKeyboardNav";
import {
  featureReorderState,
  storyReorderState,
} from "../lib/reorder";
import {
  dropTargetToParentId,
  findNodesAtDragCenter,
  isDropTargetKind,
  isReparentableKind,
  reparentItemKind,
  resolveDropTargetId,
} from "../lib/mindmapReparent";

const nodeTypes: NodeTypes = { mindmap: MindMapNode };
const { Text } = Typography;
const { TextArea } = Input;
const edgeTypes: EdgeTypes = { dep: DepEdge };

interface Props {
  projectTitle: string;
  progressPct: number;
  tree: TreeNode[];
  features: Feature[];
  userStories: UserStory[];
  milestones: Milestone[];
  dependencies?: StoryDependency[];
  progress: ProgressEntry[];
  archivedStories?: UserStory[];
  onRefresh: () => void;
  runningStoryId?: string | null;
  runningStoryIds?: string[];
}

export function MindMapPanel({
  projectTitle,
  progressPct,
  tree,
  features,
  userStories,
  milestones,
  dependencies = [],
  progress,
  archivedStories = [],
  onRefresh,
  runningStoryId = null,
  runningStoryIds = [],
}: Props) {
  const runningIds = new Set(
    [
      ...runningStoryIds,
      ...(runningStoryId ? [runningStoryId] : []),
    ].filter(Boolean)
  );
  const [selected, setSelected] = useState<SelectedMindMapNode | null>(null);
  const [selectedDepEdgeId, setSelectedDepEdgeId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [milestoneErr, setMilestoneErr] = useState<string | null>(null);
  const [showMilestoneModal, setShowMilestoneModal] = useState(false);
  const [createModal, setCreateModal] = useState<{
    type: "feature" | "story";
    parentId?: string;
  } | null>(null);
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createAcceptanceCriteria, setCreateAcceptanceCriteria] = useState(
    () => formatAcceptanceCriteria(DEFAULT_ACCEPTANCE_CRITERIA)
  );
  const [createMilestoneId, setCreateMilestoneId] = useState("");
  const [milestoneFilter, setMilestoneFilter] = useState<string | null>(null);
  const [renamingMilestoneId, setRenamingMilestoneId] = useState<string | null>(
    null
  );
  const [renameTitle, setRenameTitle] = useState("");
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const [nodeHeights, setNodeHeights] = useState<Record<string, number>>({});
  const [dragSourceId, setDragSourceId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>(() =>
    loadWorkspaceView()
  );
  const didAutoSelectRoot = useRef(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasReady, setCanvasReady] = useState(false);
  /** 首次有尺寸后保持挂载，避免折叠/展开面板时 ReactFlow 卸载导致连线丢失 */
  const [flowMounted, setFlowMounted] = useState(false);
  const flowRef = useRef<Pick<ReactFlowInstance, "getNodes" | "setNodes"> | null>(
    null
  );
  const flowNodesLayoutRef = useRef<Node<MindMapNodeData>[]>([]);

  const { sizes: mindmapSizes, onResizeEnd: onMindmapSplitEnd } = useSplitSizes(
    "loop-mindmap-split",
    [72, 28]
  );

  useLayoutEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const sync = () => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      const wrapHeight = el.parentElement?.clientHeight ?? 0;
      const ready = width > 0 && (height > 0 || wrapHeight > 0);
      setCanvasReady(ready);
      if (ready) setFlowMounted(true);
    };

    sync();
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(sync);
    });
    ro.observe(el);
    const wrap = el.parentElement;
    if (wrap) ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  const switchWorkspaceView = useCallback((view: WorkspaceView) => {
    setWorkspaceView(view);
    saveWorkspaceView(view);
  }, []);

  const filteredTree = useMemo(
    () => filterTreeByMilestone(tree, userStories, milestoneFilter),
    [tree, userStories, milestoneFilter]
  );

  const toggleCollapse = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // 仅项目 / Milestone 筛选切换时 fitView；节点重排、增删、收起展开均不改变视口
  const fitViewTrigger = useMemo(
    () => `${projectTitle}|${milestoneFilter ?? ""}`,
    [projectTitle, milestoneFilter]
  );

  useEffect(() => {
    setNodeHeights({});
  }, [fitViewTrigger]);

  const onNodeHeightChange = useCallback((id: string, height: number) => {
    setNodeHeights((prev) => {
      if (prev[id] === height) return prev;
      return { ...prev, [id]: height };
    });
  }, []);

  const { nodes, edges } = useMemo(
    () =>
      buildProjectMindMap(
        projectTitle,
        progressPct,
        filteredTree,
        dependencies,
        collapsedIds,
        nodeHeights
      ),
    [projectTitle, progressPct, filteredTree, dependencies, collapsedIds, nodeHeights]
  );

  const navIndex = useMemo(
    () => buildMindMapNavIndex(filteredTree, collapsedIds),
    [filteredTree, collapsedIds]
  );

  const nodeKindById = useMemo(() => {
    const map = new Map<string, SelectedMindMapNode["kind"]>();
    for (const n of nodes) {
      map.set(n.id, n.data.kind);
    }
    return map;
  }, [nodes]);

  useEffect(() => {
    if (selected || didAutoSelectRoot.current) return;
    const rootNode = nodes.find((n) => n.data.kind === "root");
    if (!rootNode) return;
    didAutoSelectRoot.current = true;
    setSelected({ id: rootNode.id, kind: "root" });
  }, [selected, nodes]);

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      setErr(null);
      try {
        await fn();
        onRefresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [onRefresh]
  );

  const addParentId = useMemo(() => {
    if (selected?.kind === "feature") return selected.id;
    return undefined;
  }, [selected]);

  const isProjectEmpty = features.length === 0 && userStories.length === 0;

  const flowClassName = [
    !canvasReady && "mindmap-workspace__flow--hidden",
    isProjectEmpty &&
      workspaceView === "mindmap" &&
      "mindmap-workspace__flow--behind-empty",
  ]
    .filter(Boolean)
    .join(" ") || undefined;

  const openCreate = useCallback(
    (type: "feature" | "story", parentId?: string) => {
      setCreateTitle("");
      setCreateDescription("");
      const defaultMilestoneId =
        type === "story" &&
        milestoneFilter &&
        milestoneFilter !== MILESTONE_NONE
          ? milestoneFilter
          : "";
      setCreateMilestoneId(defaultMilestoneId);
      setCreateModal({ type, parentId });
    },
    [milestoneFilter]
  );

  const closeCreateModal = () => {
    setCreateModal(null);
    setCreateTitle("");
    setCreateDescription("");
    setCreateAcceptanceCriteria(
      formatAcceptanceCriteria(DEFAULT_ACCEPTANCE_CRITERIA)
    );
    setCreateMilestoneId("");
  };

  const flowNodes = useMemo(() => {
    const canAdd =
      selected?.kind === "root" || selected?.kind === "feature";

    return nodes.map((n) => {
      const isSelected = selected?.id === n.id;
      const addable = Boolean(canAdd && isSelected);
      const collapsible = Boolean(n.data.collapsible);
      const kind = n.data.kind;
      const isStory =
        kind === "story" ||
        kind === "draft" ||
        kind === "blocked" ||
        kind === "done" ||
        kind === "pending_removal";
      const isDraft = kind === "draft";
      const storyMeta = userStories.find((s) => s.id === n.id);
      const canUnconfirm = Boolean(
        isSelected &&
          storyMeta &&
          !storyMeta.passes &&
          storyMeta.status === "ready" &&
          (kind === "story" || kind === "blocked")
      );
      const connectable = Boolean(
        (n.data as { connectable?: boolean }).connectable
      );
      const deletable =
        kind === "feature"
          ? canDeleteFeature(n.id, features, userStories)
          : kind === "story" || kind === "draft" || kind === "blocked"
            ? canHardDeleteStory(n.id, userStories, progress)
            : false;
      const isFeature = kind === "feature";
      const reorderable = isSelected && (isFeature || isStory);
      const reorderState = reorderable
        ? isFeature
          ? featureReorderState(n.id, features)
          : storyReorderState(n.id, userStories)
        : { canMoveUp: false, canMoveDown: false };
      const reorderKind = isFeature ? "feature" : "story";
      const reparentable = isReparentableKind(kind);
      return {
        ...n,
        selected: isSelected,
        deletable,
        draggable: reparentable && !busy,
        data: {
          ...n.data,
          isRunning: runningIds.has(n.id),
          isDragging: dragSourceId === n.id,
          isDropTarget: dropTargetId === n.id,
          showDepHandles: isStory && connectable,
          addable,
          confirmable: isDraft && isSelected,
          onConfirmDraft:
            isDraft && isSelected
              ? () => run(() => api.confirmStory(n.id))
              : undefined,
          unconfirmable: canUnconfirm,
          onUnconfirmDraft: canUnconfirm
            ? () => run(() => api.unconfirmStory(n.id))
            : undefined,
          onAddFeature: addable
            ? () => openCreate("feature", addParentId)
            : undefined,
          onAddStory: addable
            ? () => openCreate("story", addParentId)
            : undefined,
          onToggleCollapse: collapsible
            ? () => toggleCollapse(n.id)
            : undefined,
          onHeightChange: onNodeHeightChange,
          onRenameTitle:
            kind === "feature"
              ? (title: string) => {
                  const cur = features.find((f) => f.id === n.id);
                  if (!cur || cur.title === title) return;
                  void run(() => api.updateFeature({ id: n.id, title }));
                }
              : undefined,
          canMoveUp: reorderable ? reorderState.canMoveUp : undefined,
          canMoveDown: reorderable ? reorderState.canMoveDown : undefined,
          onMoveUp: reorderable
            ? () => {
                if (!reorderState.canMoveUp) return;
                void run(() =>
                  api.reorderMindMapItem({
                    id: n.id,
                    kind: reorderKind,
                    direction: "up",
                  })
                );
              }
            : undefined,
          onMoveDown: reorderable
            ? () => {
                if (!reorderState.canMoveDown) return;
                void run(() =>
                  api.reorderMindMapItem({
                    id: n.id,
                    kind: reorderKind,
                    direction: "down",
                  })
                );
              }
            : undefined,
        },
      };
    });
  }, [nodes, selected, addParentId, openCreate, toggleCollapse, onNodeHeightChange, features, userStories, progress, run, runningStoryId, runningStoryIds, runningIds, busy, dragSourceId, dropTargetId]);

  flowNodesLayoutRef.current = flowNodes;

  const handleNodeDragStart: OnNodeDrag<Node<MindMapNodeData>> = useCallback(
    (_event, node) => {
      if (busy || isConnecting) return;
      setDragSourceId(node.id);
      setDropTargetId(null);
    },
    [busy, isConnecting]
  );

  const handleNodeDrag: OnNodeDrag<Node<MindMapNodeData>> = useCallback(
    (_event, node) => {
      const rf = flowRef.current;
      if (!rf) return;
      const intersections = findNodesAtDragCenter(node, rf.getNodes()).filter(
        (n: Node) => isDropTargetKind((n.data as MindMapNodeData).kind)
      );
      setDropTargetId(resolveDropTargetId(intersections, node.id));
    },
    []
  );

  const handleNodeDragStop: OnNodeDrag<Node<MindMapNodeData>> = useCallback(
    (_event, node) => {
      const rf = flowRef.current;
      setDragSourceId(null);
      setDropTargetId(null);
      rf?.setNodes((current) =>
        current.map((n) => {
          const layout = flowNodesLayoutRef.current.find((ln) => ln.id === n.id);
          return layout ? { ...n, position: layout.position } : n;
        })
      );

      if (busy || isConnecting) return;

      const kind = (node.data as MindMapNodeData).kind;
      if (!isReparentableKind(kind)) return;

      const intersections = rf
        ? findNodesAtDragCenter(node, rf.getNodes()).filter((n: Node) =>
            isDropTargetKind((n.data as MindMapNodeData).kind)
          )
        : [];
      const targetId = resolveDropTargetId(intersections, node.id);
      if (!targetId) return;

      const parentId = dropTargetToParentId(targetId);
      const itemKind = reparentItemKind(kind);

      if (itemKind === "feature") {
        const cur = features.find((f) => f.id === node.id);
        if (!cur || cur.parentId === parentId || parentId === node.id) return;
      } else {
        const cur = userStories.find((s) => s.id === node.id);
        if (!cur || cur.parentId === parentId) return;
      }

      void run(() =>
        api.moveMindMapItem({ id: node.id, kind: itemKind, parentId })
      );
    },
    [busy, isConnecting, features, userStories, run]
  );

  const flowEdges = useMemo(
    () =>
      edges.map((e) => {
        if (!isDependencyEdge(e)) return e;
        const selected = e.id === selectedDepEdgeId;
        return {
          ...e,
          selected,
          markerEnd: depEdgeMarker(
            depEdgeStrokeColor(selected),
            selected ? { width: 7, height: 7 } : { width: 10, height: 10 }
          ),
        };
      }),
    [edges, selectedDepEdgeId]
  );

  const onNodesDelete: OnNodesDelete = useCallback(
    (deleted) => {
      if (isFormFieldFocused() || busy) return;
      void run(async () => {
        for (const node of deleted) {
          const kind = (node.data as { kind: string }).kind;
          if (
            kind === "feature" &&
            canDeleteFeature(node.id, features, userStories)
          ) {
            await api.deleteFeature(node.id);
          } else if (
            (kind === "story" || kind === "draft" || kind === "blocked") &&
            canHardDeleteStory(node.id, userStories, progress)
          ) {
            await api.deleteStory(node.id);
          }
        }
        setSelected(null);
      });
    },
    [run, features, userStories, progress, busy]
  );

  const isDepHandleConnection = (conn: {
    sourceHandle?: string | null;
    targetHandle?: string | null;
  }) => conn.sourceHandle === "dep-out" && conn.targetHandle === "dep-in";

  const onConnect = useCallback(
    (conn: Connection) => {
      if (
        !conn.source ||
        !conn.target ||
        conn.source === conn.target ||
        !isDepHandleConnection(conn)
      ) {
        return;
      }
      void run(() => api.addDependency(conn.source!, conn.target!));
    },
    [run]
  );

  const onEdgesDelete: OnEdgesDelete = useCallback(
    (deleted) => {
      if (isFormFieldFocused() || busy) return;
      const deps = deleted.filter((e) => isDependencyEdge(e as Edge));
      if (!deps.length) return;
      void run(async () => {
        for (const edge of deps) {
          const from = edge.source;
          const to = edge.target;
          if (from && to) await api.removeDependency(from, to);
        }
        setSelectedDepEdgeId(null);
      });
    },
    [run, busy]
  );

  const onEdgeClick = useCallback((_: MouseEvent, edge: Edge) => {
    if (!isDependencyEdge(edge)) return;
    setSelectedDepEdgeId((prev) => (prev === edge.id ? null : edge.id));
    setSelected(null);
  }, []);

  const selectFilter = (key: string) => {
    setMilestoneFilter(key);
  };

  const clearFilters = () => setMilestoneFilter(null);

  const submitRename = () => {
    const t = renameTitle.trim();
    const id = renamingMilestoneId;
    setRenamingMilestoneId(null);
    if (!id || !t) return;
    const cur = milestones.find((m) => m.id === id);
    if (cur?.title === t) return;
    void run(() => api.updateMilestone(id, t));
  };

  const closeMilestoneModal = () => {
    setShowMilestoneModal(false);
    setMilestoneTitle("");
    setMilestoneErr(null);
  };

  const submitMilestone = () => {
    const t = milestoneTitle.trim();
    if (!t) return;
    setBusy(true);
    setMilestoneErr(null);
    void api
      .addMilestone(t)
      .then(() => {
        closeMilestoneModal();
        onRefresh();
      })
      .catch((e) => {
        setMilestoneErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setBusy(false));
  };

  const submitCreate = () => {
    const t = createTitle.trim();
    if (!t || !createModal) return;

    const { type, parentId } = createModal;
    void run(async () => {
      if (type === "feature") {
        await api.addFeature({ title: t, parentId });
      } else {
        const description = createDescription.trim();
        await api.addStory({
          title: t,
          parentId,
          milestoneId: createMilestoneId || null,
          ...(description ? { description } : {}),
          acceptanceCriteria: parseAcceptanceCriteria(createAcceptanceCriteria),
        });
      }
      closeCreateModal();
    });
  };

  const handleAddFeature = useCallback(
    () => openCreate("feature", addParentId),
    [openCreate, addParentId]
  );

  const handleAddStory = useCallback(
    () => openCreate("story", addParentId),
    [openCreate, addParentId]
  );

  const filterActive = milestoneFilter !== null;

  const selectNodeById = useCallback(
    (id: string) => {
      const kind = nodeKindById.get(id);
      if (!kind) return;
      setSelectedDepEdgeId(null);
      setSelected({ id, kind });
    },
    [nodeKindById]
  );

  const handleCanvasKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (
        isFormFieldFocused() ||
        busy ||
        showMilestoneModal ||
        createModal ||
        renamingMilestoneId
      ) {
        return;
      }

      const keyMap: Record<string, NavDirection> = {
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
      };

      const reorderDirection =
        e.key === "PageUp"
          ? "up"
          : e.key === "PageDown"
            ? "down"
            : null;

      if (
        reorderDirection &&
        selected &&
        selected.kind !== "root" &&
        selected.kind !== "archived"
      ) {
        const kind =
          selected.kind === "feature" ? "feature" : ("story" as const);
        const state =
          kind === "feature"
            ? featureReorderState(selected.id, features)
            : storyReorderState(selected.id, userStories);
        if (
          (reorderDirection === "up" && !state.canMoveUp) ||
          (reorderDirection === "down" && !state.canMoveDown)
        ) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        void run(() =>
          api.reorderMindMapItem({
            id: selected.id,
            kind,
            direction: reorderDirection,
          })
        );
        return;
      }

      const direction = keyMap[e.key];
      if (!direction) return;

      e.preventDefault();
      e.stopPropagation();

      const nextId = navigateMindMapNode(selected?.id ?? null, direction, navIndex);
      if (!nextId || nextId === selected?.id) return;
      selectNodeById(nextId);
    },
    [
      busy,
      showMilestoneModal,
      createModal,
      renamingMilestoneId,
      selected,
      features,
      userStories,
      run,
      navIndex,
      selectNodeById,
    ]
  );

  useEffect(() => {
    if (selected && !navIndex.visible.has(selected.id)) {
      setSelected(null);
    }
  }, [selected, navIndex.visible]);

  return (
    <div className="mm-panel">
      <div className="mm-toolbar">
        <Segmented
          className="mm-view-tabs"
          value={workspaceView}
          onChange={(value) => switchWorkspaceView(value as WorkspaceView)}
          options={[
            { label: "脑图", value: "mindmap" },
            { label: "树形", value: "tree" },
          ]}
        />
        <span className="mm-hint muted">
          {workspaceView === "mindmap"
            ? "项目/Feature 右侧按钮可收起展开 · Feature 双击改名 · 拖曳 Story/Feature 到 Feature 或项目根改父级 · 选中 Feature/Story 后 PageUp/PageDown 调序 · Story 出点连入点建依赖 · 方向键切换节点 · Delete 删依赖线"
            : "树形视图展示项目 / Feature / Story 层级 · 点击节点查看属性 · 可与脑图视图互相切换并保持选中"}
        </span>
      </div>

      <div
        className={`mm-milestone-bar${filterActive ? " mm-milestone-bar--filtered" : ""}`}
      >
        <span className="mm-milestone-bar__label">MileStone</span>
        <MilestoneChip
          active={!filterActive}
          disabled={busy}
          onClick={clearFilters}
        >
          全部
        </MilestoneChip>
        {milestones.map((m) =>
          renamingMilestoneId === m.id ? (
            <Input
              key={m.id}
              size="small"
              className="mm-chip-input"
              value={renameTitle}
              disabled={busy}
              autoFocus
              onChange={(e) => setRenameTitle(e.target.value)}
              onBlur={submitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitRename();
                if (e.key === "Escape") setRenamingMilestoneId(null);
              }}
            />
          ) : (
            <MilestoneChip
              key={m.id}
              active={milestoneFilter === m.id}
              disabled={busy}
              onClick={() => selectFilter(m.id)}
              onDoubleClick={(e) => {
                e.preventDefault();
                setRenamingMilestoneId(m.id);
                setRenameTitle(m.title);
              }}
              title="单击筛选 · 双击改名"
            >
              {m.title}
            </MilestoneChip>
          )
        )}
        <MilestoneChip
          active={milestoneFilter === MILESTONE_NONE}
          disabled={busy}
          onClick={() => selectFilter(MILESTONE_NONE)}
        >
          {MILESTONE_NONE_LABEL}
        </MilestoneChip>
        <MilestoneChip
          variant="add"
          disabled={busy}
          onClick={() => {
            setMilestoneErr(null);
            setShowMilestoneModal(true);
          }}
        >
          + MileStone
        </MilestoneChip>
      </div>

      <Modal
        open={showMilestoneModal}
        title="新建 Milestone 标签"
        onClose={closeMilestoneModal}
      >
        <form
          className="modal-form"
          onSubmit={(e) => {
            e.preventDefault();
            submitMilestone();
          }}
        >
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <div className="modal-form__field">
              <Text className="modal-form__label">标签名称</Text>
              <Input
                placeholder="例如：v1.0 发布"
                value={milestoneTitle}
                onChange={(e) => setMilestoneTitle(e.target.value)}
                autoFocus
                disabled={busy}
              />
            </div>
            <Text type="secondary" className="modal-form__hint">
              Milestone 用于 Story 筛选与分组，不会出现在脑图树中。
            </Text>
            {milestoneErr && (
              <ErrorAlert
                error={milestoneErr}
                closable
                onClose={() => setMilestoneErr(null)}
              />
            )}
            <Space className="modal-form__actions">
              <Button disabled={busy} onClick={closeMilestoneModal}>
                取消
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                disabled={busy || !milestoneTitle.trim()}
              >
                创建
              </Button>
            </Space>
          </Space>
        </form>
      </Modal>

      <Modal
        open={Boolean(createModal)}
        title={
          createModal?.type === "feature" ? "新建 Feature" : "新建 Story"
        }
        onClose={closeCreateModal}
      >
        <form
          className="modal-form"
          onSubmit={(e) => {
            e.preventDefault();
            submitCreate();
          }}
        >
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <div className="modal-form__field">
              <Text className="modal-form__label">标题</Text>
              <Input
                placeholder={
                  createModal?.type === "feature"
                    ? "例如：用户认证"
                    : "例如：登录页面"
                }
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                autoFocus
                disabled={busy}
              />
            </div>
            {createModal?.type === "story" && (
              <div className="modal-form__field">
                <Text className="modal-form__label">描述</Text>
                <TextArea
                  rows={4}
                  placeholder="例如：作为用户，我需要登录页面以便访问个人账户"
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  disabled={busy}
                />
              </div>
            )}
            {createModal?.type === "story" && (
              <div className="modal-form__field">
                <Text className="modal-form__label">验收标准</Text>
                <TextArea
                  rows={3}
                  placeholder="每行一条，例如：npm test 通过"
                  value={createAcceptanceCriteria}
                  onChange={(e) => setCreateAcceptanceCriteria(e.target.value)}
                  disabled={busy}
                />
              </div>
            )}
            {createModal?.type === "story" && milestones.length > 0 && (
              <div className="modal-form__field">
                <Text className="modal-form__label">Milestone 标签</Text>
                <div className="props-milestone-chips">
                  <MilestoneChip
                    active={!createMilestoneId}
                    disabled={busy}
                    onClick={() => setCreateMilestoneId("")}
                  >
                    {MILESTONE_NONE_LABEL}
                  </MilestoneChip>
                  {milestones.map((m) => (
                    <MilestoneChip
                      key={m.id}
                      active={createMilestoneId === m.id}
                      disabled={busy}
                      onClick={() => setCreateMilestoneId(m.id)}
                    >
                      {m.title}
                    </MilestoneChip>
                  ))}
                </div>
              </div>
            )}
            {createModal?.parentId && (
              <Text type="secondary" className="modal-form__hint">
                父级：{features.find((f) => f.id === createModal.parentId)?.title ?? createModal.parentId}
              </Text>
            )}
            {createModal && !createModal.parentId && selected?.kind === "root" && (
              <Text type="secondary" className="modal-form__hint">
                将添加为项目根级节点
              </Text>
            )}
            <Space className="modal-form__actions">
              <Button disabled={busy} onClick={closeCreateModal}>
                取消
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                disabled={busy || !createTitle.trim()}
              >
                创建
              </Button>
            </Space>
          </Space>
        </form>
      </Modal>

      <ErrorAlert
        className="mm-error"
        error={err}
        closable
        onClose={() => setErr(null)}
      />

      <Splitter
        className="mindmap-workspace-splitter"
        onResizeEnd={onMindmapSplitEnd}
      >
        <Splitter.Panel
          defaultSize={mindmapSizes[0] || "72%"}
          min={240}
        >
          <div className="mindmap-workspace__canvas-wrap">
            <div
              ref={canvasRef}
              className={`mindmap-workspace__canvas${
                workspaceView === "tree" ? " mindmap-workspace__canvas--tree" : ""
              }`}
              tabIndex={workspaceView === "mindmap" ? 0 : -1}
              onKeyDownCapture={
                workspaceView === "mindmap" ? handleCanvasKeyDown : undefined
              }
            >
            {isProjectEmpty && workspaceView === "mindmap" && (
              <div className="mindmap-workspace__empty">
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="暂无 Feature / Story，从下方开始规划"
                >
                  <Space wrap>
                    <Button
                      type="primary"
                      disabled={busy}
                      onClick={handleAddFeature}
                    >
                      + Feature
                    </Button>
                    <Button disabled={busy} onClick={handleAddStory}>
                      + Story
                    </Button>
                  </Space>
                </Empty>
              </div>
            )}
          {workspaceView === "tree" ? (
            <ProjectTreeView
              projectTitle={projectTitle}
              progressPct={progressPct}
              tree={filteredTree}
              selectedId={selected?.id ?? null}
              runningIds={runningIds}
              onSelect={(id, kind) => {
                setSelectedDepEdgeId(null);
                setSelected({ id, kind });
              }}
            />
          ) : flowMounted ? (
          <ReactFlow
            className={flowClassName}
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodesDraggable
            nodeDragThreshold={8}
            nodesConnectable
            nodesFocusable={false}
            elementsSelectable
            disableKeyboardA11y
            autoPanOnNodeFocus={false}
            autoPanOnNodeDrag={false}
            autoPanOnConnect={false}
            onInit={(instance) => {
              flowRef.current = instance as Pick<
                ReactFlowInstance,
                "getNodes" | "setNodes"
              >;
            }}
            onNodeDragStart={handleNodeDragStart}
            onNodeDrag={handleNodeDrag}
            onNodeDragStop={handleNodeDragStop}
            onNodeClick={(_, node) => {
              const kind = (node.data as { kind: SelectedMindMapNode["kind"] }).kind;
              setSelectedDepEdgeId(null);
              setSelected({ id: node.id, kind });
              canvasRef.current?.focus();
            }}
            onPaneClick={() => {
              setSelectedDepEdgeId(null);
              setSelected(null);
              canvasRef.current?.focus();
            }}
            connectionMode={ConnectionMode.Strict}
            isValidConnection={(conn) => {
              if (
                !conn.source ||
                !conn.target ||
                conn.source === conn.target ||
                !isDepHandleConnection(conn)
              ) {
                return false;
              }
              const src = nodes.find((n) => n.id === conn.source);
              const tgt = nodes.find((n) => n.id === conn.target);
              return Boolean(
                (src?.data as { connectable?: boolean }).connectable &&
                  (tgt?.data as { connectable?: boolean }).connectable
              );
            }}
            onConnect={onConnect}
            onConnectStart={() => setIsConnecting(true)}
            onConnectEnd={() => setIsConnecting(false)}
            onEdgeClick={onEdgeClick}
            onNodesDelete={onNodesDelete}
            onEdgesDelete={onEdgesDelete}
            edgesFocusable
            elevateEdgesOnSelect
            deleteKeyCode={["Backspace", "Delete"]}
            panOnDrag
            zoomOnScroll
            minZoom={0.4}
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
          >
            <FitViewOnLoad trigger={fitViewTrigger} />
            <Background
              variant={BackgroundVariant.Dots}
              gap={18}
              size={1}
              color="var(--mm-grid)"
            />
          </ReactFlow>
          ) : null}
            </div>
          </div>
        </Splitter.Panel>

        <Splitter.Panel
          defaultSize={mindmapSizes[1] || 280}
          min={200}
          max={480}
          collapsible
        >
          <NodePropsPanel
          selected={selected}
          projectTitle={projectTitle}
          progressPct={progressPct}
          features={features}
          userStories={userStories}
          milestones={milestones}
          dependencies={dependencies}
          progress={progress}
          busy={busy}
          archivedStories={archivedStories}
          onSelectArchived={(storyId) =>
            setSelected({ id: storyId, kind: "archived" })
          }
          onRequestRemoval={(storyId, reason) =>
            run(() => api.requestStoryRemoval(storyId, reason))
          }
          onCancelRemoval={(storyId) =>
            run(() => api.cancelStoryRemoval(storyId))
          }
          onArchiveStory={(storyId, reason) =>
            run(async () => {
              await api.archiveStory(storyId, reason);
              setSelected(null);
            })
          }
          onRestoreStory={(storyId) =>
            run(async () => {
              await api.restoreStory(storyId);
              setSelected(null);
            })
          }
          onPurgeStory={(storyId) =>
            run(async () => {
              await api.purgeStory(storyId);
              setSelected(null);
            })
          }
          onAssignMilestone={(storyId, mid) =>
            run(() => api.setStoryMilestone(storyId, mid))
          }
          onSetStoryPriority={(storyId, priority) =>
            run(() => api.setStoryPriority(storyId, priority))
          }
          onAddFeature={handleAddFeature}
          onAddStory={handleAddStory}
          onUpdateFeature={(input) =>
            run(() => api.updateFeature(input))
          }
          onUpdateStory={(input) =>
            run(() => api.updateStory(input))
          }
          onDeleteStory={(storyId) =>
            run(async () => {
              await api.deleteStory(storyId);
              setSelected(null);
            })
          }
          onConfirmStory={(storyId) => run(() => api.confirmStory(storyId))}
          onUnconfirmStory={(storyId) => run(() => api.unconfirmStory(storyId))}
          onCompleteStory={({ storyId, summary }) =>
            run(() => api.completeStory({ storyId, summary }))
          }
        />
        </Splitter.Panel>
      </Splitter>
    </div>
  );
}
