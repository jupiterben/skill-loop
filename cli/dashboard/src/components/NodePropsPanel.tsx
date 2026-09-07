import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Descriptions,
  Input,
  InputNumber,
  List,
  Modal,
  Select,
  Space,
  Tag,
  Typography,
} from "antd";
import type {
  Feature,
  Milestone,
  PreferredTool,
  ProgressEntry,
  SelectedMindMapNode,
  StoryDependency,
  StoryWorkType,
  UserStory,
} from "../types";
import {
  canArchiveStory,
  canCancelRemoval,
  canHardDeleteStory,
  canPurgeStory,
  canRequestRemoval,
  canRestoreStory,
  isReopenedCompletedStory,
} from "../lib/deletable";
import { MILESTONE_NONE_LABEL } from "../lib/treeFilter";
import { MilestoneChip } from "./MilestoneChip";
import { milestoneFullLabel } from "../features/milestones/milestoneLabel";
import { useSyncedStoryFields } from "../hooks/useSyncedStoryFields";
import { PropsSectionCollapse } from "./PropsSectionCollapse";
import { featureChildStories } from "../features/mindmap-props/featureChildStories";
import { EMPTY_LEAF_FEATURE_HINT } from "../features/mindmap-props/emptyLeafFeature";
import { STORY_WORK_TYPE_OPTIONS } from "../features/story-work-type/storyWorkType";

const { Text } = Typography;
const { TextArea } = Input;

interface Props {
  selected: SelectedMindMapNode | null;
  projectTitle: string;
  progressPct: number;
  features: Feature[];
  userStories: UserStory[];
  milestones: Milestone[];
  dependencies: StoryDependency[];
  progress: ProgressEntry[];
  busy?: boolean;
  onAssignMilestone?: (storyId: string, milestoneId: string | null) => void;
  onSetStoryPriority?: (storyId: string, priority: number) => void;
  onSetStoryPreferredTool?: (
    storyId: string,
    preferredTool: PreferredTool | null
  ) => void;
  onAddFeature?: () => void;
  onAddStory?: () => void;
  onUpdateFeature?: (input: {
    id: string;
    title: string;
    description: string;
  }) => void;
  onUpdateStory?: (input: {
    storyId: string;
    title: string;
    description: string;
    workType: StoryWorkType;
    acceptanceCriteria: string[];
    changeNote?: string;
    status: "draft" | "ready";
  }) => void;
  onCompleteStory?: (input: {
    storyId: string;
    summary: string;
  }) => void;
  onDeleteStory?: (storyId: string) => void;
  archivedStories?: UserStory[];
  onRequestRemoval?: (storyId: string, reason?: string) => void;
  onCancelRemoval?: (storyId: string) => void;
  onArchiveStory?: (storyId: string, reason?: string) => void;
  onRestoreStory?: (storyId: string) => void;
  onPurgeStory?: (storyId: string) => void;
  onConfirmStory?: (storyId: string) => void;
  onUnconfirmStory?: (storyId: string) => void;
  onSelectArchived?: (storyId: string) => void;
  onSelectNode?: (id: string, kind: SelectedMindMapNode["kind"]) => void;
  onEditingChange?: (editing: boolean) => void;
}

function confirmAction(
  title: string,
  content: string,
  onOk: () => void
) {
  Modal.confirm({
    title,
    content,
    okText: "确定",
    cancelText: "取消",
    onOk,
  });
}

function AddActions({
  busy,
  onAddFeature,
  onAddStory,
}: {
  busy?: boolean;
  onAddFeature?: () => void;
  onAddStory?: () => void;
}) {
  if (!onAddFeature && !onAddStory) return null;
  return (
    <Space wrap className="props-panel__actions">
      {onAddFeature && (
        <Button
          type="primary"
          size="small"
          className="props-panel__action"
          disabled={busy}
          onClick={onAddFeature}
        >
          + Feature
        </Button>
      )}
      {onAddStory && (
        <Button
          size="small"
          className="props-panel__action"
          disabled={busy}
          onClick={onAddStory}
        >
          + Story
        </Button>
      )}
    </Space>
  );
}

function FeatureStoryList({
  stories,
  busy,
  onSelectNode,
}: {
  stories: UserStory[];
  busy?: boolean;
  onSelectNode?: (id: string, kind: SelectedMindMapNode["kind"]) => void;
}) {
  if (stories.length === 0) {
    return (
      <Text type="secondary" className="props-story-form__hint">
        暂无子 Story
      </Text>
    );
  }

  return (
    <List
      size="small"
      className="props-feature-stories"
      dataSource={stories}
      renderItem={(s) => {
        const kind: SelectedMindMapNode["kind"] = s.passes
          ? "done"
          : s.status === "draft"
            ? "draft"
            : s.removalRequestedAt
              ? "pending_removal"
              : "story";
        return (
          <List.Item className="props-feature-stories__item">
            <Button
              type="link"
              size="small"
              disabled={busy}
              className="props-feature-stories__link"
              onClick={() => onSelectNode?.(s.id, kind)}
            >
              <code>{s.id}</code>
              <span>{s.title}</span>
              {s.passes && <Tag color="success">已完成</Tag>}
              {s.status === "draft" && !s.passes && <Tag>草稿</Tag>}
            </Button>
          </List.Item>
        );
      }}
    />
  );
}

function FeatureSectionsPanel({
  feature,
  parentFeature,
  childStories,
  childFeatureCount,
  busy,
  onUpdateFeature,
  onSelectNode,
  onEditingChange,
}: {
  feature: Feature;
  parentFeature?: Feature | null;
  childStories: UserStory[];
  childFeatureCount: number;
  busy?: boolean;
  onUpdateFeature?: Props["onUpdateFeature"];
  onSelectNode?: Props["onSelectNode"];
  onEditingChange?: (editing: boolean) => void;
}) {
  const featureIdRef = useRef(feature.id);
  const [detachedSnapshot, setDetachedSnapshot] = useState<Feature | null>(null);
  const isDetached = detachedSnapshot !== null;
  const viewFeature = detachedSnapshot ?? feature;

  const [title, setTitleState] = useState(feature.title);
  const [description, setDescriptionState] = useState(feature.description);

  const dirty =
    title !== feature.title || description !== feature.description;

  const syncFromFeature = useCallback((source: Feature) => {
    setTitleState(source.title);
    setDescriptionState(source.description);
  }, []);

  const releaseDetached = useCallback(() => {
    setDetachedSnapshot(null);
    onEditingChange?.(false);
  }, [onEditingChange]);

  const detach = useCallback(() => {
    setDetachedSnapshot((prev) => {
      if (prev) return prev;
      onEditingChange?.(true);
      return { ...feature };
    });
  }, [feature, onEditingChange]);

  const setTitle = useCallback(
    (value: string) => {
      detach();
      setTitleState(value);
    },
    [detach]
  );

  const setDescription = useCallback(
    (value: string) => {
      detach();
      setDescriptionState(value);
    },
    [detach]
  );

  useEffect(() => {
    if (feature.id !== featureIdRef.current) {
      featureIdRef.current = feature.id;
      setDetachedSnapshot(null);
      onEditingChange?.(false);
      syncFromFeature(feature);
      return;
    }
    if (isDetached) return;
    syncFromFeature(feature);
  }, [feature, isDetached, syncFromFeature, onEditingChange]);

  useEffect(() => {
    if (!isDetached || dirty) return;
    releaseDetached();
  }, [isDetached, dirty, releaseDetached]);

  const cancelEdit = useCallback(() => {
    releaseDetached();
    syncFromFeature(feature);
  }, [releaseDetached, syncFromFeature, feature]);

  return (
    <>
      {childFeatureCount === 0 && childStories.length === 0 && (
        <Alert
          type="warning"
          showIcon
          className="props-panel__empty-leaf-hint"
          message="空叶子 Feature"
          description={EMPTY_LEAF_FEATURE_HINT}
        />
      )}
      <PropsSectionCollapse
        storageKey="loop-props-section-feature-edit"
        title="编辑"
        defaultOpen
      >
        <Space direction="vertical" size="small" style={{ width: "100%" }}>
          {parentFeature && (
            <div className="props-field">
              <Text type="secondary" className="props-field__label">
                父级 Feature
              </Text>
              <Text>{parentFeature.title}</Text>
            </div>
          )}
          <div className="props-field">
            <Text type="secondary" className="props-field__label">
              名称
            </Text>
            <Input
              value={title}
              disabled={busy}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="props-field">
            <Text type="secondary" className="props-field__label">
              描述
            </Text>
            <TextArea
              rows={4}
              value={description}
              disabled={busy}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {isDetached && dirty && (
            <Text type="warning" className="props-story-form__hint">
              编辑中已脱离后台刷新；保存或放弃修改后恢复同步。
            </Text>
          )}
          {onUpdateFeature && (
            <>
              {isDetached && dirty && (
                <Button block disabled={busy} onClick={cancelEdit}>
                  放弃修改
                </Button>
              )}
              <Button
                type="primary"
                block
                disabled={busy || !title.trim() || !dirty}
                onClick={() => {
                  onUpdateFeature({
                    id: viewFeature.id,
                    title: title.trim(),
                    description,
                  });
                }}
              >
                保存
              </Button>
            </>
          )}
        </Space>
      </PropsSectionCollapse>

      <PropsSectionCollapse
        storageKey="loop-props-section-feature-stories"
        title={`Story（${childStories.length}）`}
        defaultOpen
      >
        <FeatureStoryList
          stories={childStories}
          busy={busy}
          onSelectNode={onSelectNode}
        />
      </PropsSectionCollapse>
    </>
  );
}

function PriorityEditor({
  story,
  busy,
  onSetPriority,
}: {
  story: UserStory;
  busy?: boolean;
  onSetPriority?: (storyId: string, priority: number) => void;
}) {
  const [value, setValue] = useState(story.priority);
  const storyIdRef = useRef(story.id);
  const dirty = value !== story.priority;

  useEffect(() => {
    if (story.id !== storyIdRef.current) {
      storyIdRef.current = story.id;
      setValue(story.priority);
      return;
    }
    if (dirty) return;
    setValue(story.priority);
  }, [story.id, story.priority, dirty]);

  if (!onSetPriority) {
    return <Text>P{story.priority}</Text>;
  }

  const commit = () => {
    if (value === story.priority) return;
    if (!Number.isInteger(value) || value < 0) {
      setValue(story.priority);
      return;
    }
    onSetPriority(story.id, value);
  };

  return (
    <Space direction="vertical" size={2} style={{ width: "100%" }}>
      <InputNumber
        min={0}
        precision={0}
        value={value}
        disabled={busy}
        onChange={(v) => setValue(typeof v === "number" ? v : story.priority)}
        onBlur={commit}
        onPressEnter={commit}
        style={{ width: "100%" }}
      />
      <Text type="secondary" className="props-story-form__hint">
        数值越小越先执行；同优先级时按 sortOrder 排序
      </Text>
    </Space>
  );
}

function StorySectionsPanel({
  story,
  busy,
  isBlocked,
  milestones,
  milestone,
  depsIn,
  depsOut,
  storiesById,
  storyProgress,
  onUpdateStory,
  onCompleteStory,
  onAssignMilestone,
  onSetStoryPriority,
  onSetStoryPreferredTool,
  onConfirmStory,
  onUnconfirmStory,
  onRequestRemoval,
  onCancelRemoval,
  onArchiveStory,
  onDeleteStory,
  userStories,
  progress,
  onEditingChange,
  onHeaderTitleChange,
}: {
  story: UserStory;
  busy?: boolean;
  isBlocked: boolean;
  milestones: Milestone[];
  milestone: Milestone | null | undefined;
  depsIn: string[];
  depsOut: string[];
  storiesById: Map<string, UserStory>;
  storyProgress: ProgressEntry[];
  onUpdateStory?: Props["onUpdateStory"];
  onCompleteStory?: Props["onCompleteStory"];
  onAssignMilestone?: Props["onAssignMilestone"];
  onSetStoryPriority?: Props["onSetStoryPriority"];
  onSetStoryPreferredTool?: Props["onSetStoryPreferredTool"];
  onConfirmStory?: Props["onConfirmStory"];
  onUnconfirmStory?: Props["onUnconfirmStory"];
  onRequestRemoval?: Props["onRequestRemoval"];
  onCancelRemoval?: Props["onCancelRemoval"];
  onArchiveStory?: Props["onArchiveStory"];
  onDeleteStory?: Props["onDeleteStory"];
  userStories: UserStory[];
  progress: ProgressEntry[];
  onEditingChange?: (editing: boolean) => void;
  onHeaderTitleChange?: (title: string) => void;
}) {
  const {
    title,
    setTitle,
    description,
    setDescription,
    acceptanceCriteria,
    setAcceptanceCriteria,
    workType,
    setWorkType,
    changeNote,
    setChangeNote,
    parsedAcceptanceCriteria,
    dirty,
    isDetached,
    viewStory,
    cancelEdit,
    resetAfterSave,
  } = useSyncedStoryFields(story, onEditingChange);

  const frozenProgressRef = useRef(storyProgress);
  if (!isDetached) {
    frozenProgressRef.current = storyProgress;
  }
  const displayProgress = isDetached
    ? frozenProgressRef.current
    : storyProgress;

  const panelStory = viewStory;
  const isDraft = !panelStory.passes && panelStory.status === "draft";
  const panelMilestone = panelStory.milestoneId
    ? milestones.find((m) => m.id === panelStory.milestoneId)
    : null;

  useEffect(() => {
    onHeaderTitleChange?.(title);
  }, [title, onHeaderTitleChange]);

  const [completeOpen, setCompleteOpen] = useState(false);
  const [completeSummary, setCompleteSummary] = useState("");

  const canSave = Boolean(onUpdateStory) && (dirty || panelStory.passes);
  const canComplete =
    Boolean(onCompleteStory) &&
    !panelStory.passes &&
    panelStory.status === "ready" &&
    !isBlocked &&
    !panelStory.removalRequestedAt;

  const submit = (status: "draft" | "ready") => {
    onUpdateStory?.({
      storyId: panelStory.id,
      title: title.trim(),
      description,
      workType,
      acceptanceCriteria: parsedAcceptanceCriteria,
      changeNote: changeNote.trim() || undefined,
      status,
    });
    resetAfterSave();
  };

  const submitComplete = () => {
    const summary = completeSummary.trim();
    if (!summary) return;
    onCompleteStory?.({ storyId: panelStory.id, summary });
    setCompleteOpen(false);
    setCompleteSummary("");
  };

  return (
    <>
      <PropsSectionCollapse
        storageKey="loop-props-section-edit"
        title="编辑"
        defaultOpen
      >
        <Space direction="vertical" size="small" style={{ width: "100%" }}>
          <div className="props-field">
            <Text type="secondary" className="props-field__label">
              标题
            </Text>
            <Input
              value={title}
              disabled={busy}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="props-field">
            <Text type="secondary" className="props-field__label">
              描述
            </Text>
            <TextArea
              rows={4}
              value={description}
              disabled={busy}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="props-field">
            <Text type="secondary" className="props-field__label">
              类型
            </Text>
            <Select
              value={workType}
              disabled={busy}
              options={STORY_WORK_TYPE_OPTIONS}
              onChange={(value: StoryWorkType) => setWorkType(value)}
              style={{ width: "100%" }}
            />
          </div>
          <div className="props-field">
            <Text type="secondary" className="props-field__label">
              验收标准
            </Text>
            <TextArea
              rows={4}
              placeholder="每行一条，例如：npm test 通过"
              value={acceptanceCriteria}
              disabled={busy}
              onChange={(e) => setAcceptanceCriteria(e.target.value)}
            />
          </div>
          <div className="props-field">
            <Text type="secondary" className="props-field__label">
              状态
            </Text>
            <StoryStatusTag story={panelStory} isBlocked={isBlocked} />
          </div>
          <div className="props-field">
            <Text type="secondary" className="props-field__label">
              优先级
            </Text>
            <PriorityEditor
              story={panelStory}
              busy={busy || isDetached}
              onSetPriority={onSetStoryPriority}
            />
          </div>
          <div className="props-field">
            <Text type="secondary" className="props-field__label">
              Agent
            </Text>
            <Select
              size="small"
              disabled={busy || isDetached || !onSetStoryPreferredTool}
              value={panelStory.preferredTool ?? ""}
              options={[
                { value: "", label: "未指定" },
                { value: "agent", label: "agent" },
                { value: "claude", label: "claude" },
                { value: "codex", label: "codex" },
                { value: "cursor", label: "cursor" },
              ]}
              onChange={(v: string) =>
                onSetStoryPreferredTool?.(
                  panelStory.id,
                  v === "" ? null : (v as PreferredTool)
                )
              }
              style={{ width: "100%" }}
            />
          </div>
          {isDetached && dirty && (
            <Text type="warning" className="props-story-form__hint">
              编辑中已脱离后台刷新；保存或放弃修改后恢复同步。
            </Text>
          )}
          {canSave && (
            <>
              <div className="props-field">
                <Text type="secondary" className="props-field__label">
                  变更说明（写入进度日志）
                </Text>
                <TextArea
                  rows={2}
                  placeholder="可选，说明为何修改需求"
                  value={changeNote}
                  disabled={busy}
                  onChange={(e) => setChangeNote(e.target.value)}
                />
              </div>
              <Space direction="vertical" size="small" style={{ width: "100%" }}>
                {isDetached && dirty && (
                  <Button block disabled={busy} onClick={cancelEdit}>
                    放弃修改
                  </Button>
                )}
                <Button
                  block
                  disabled={busy || !title.trim()}
                  onClick={() => submit("draft")}
                >
                  保存为草稿
                </Button>
                <Button
                  type="primary"
                  block
                  disabled={busy || !title.trim()}
                  onClick={() => submit("ready")}
                >
                  保存为待实现
                </Button>
              </Space>
              <Text type="secondary" className="props-story-form__hint">
                {panelStory.passes
                  ? "修改后将重置完成状态并记入进度日志。"
                  : "保存为草稿需确认后才可执行；保存为待实现将进入执行队列。"}
              </Text>
            </>
          )}

          <div className="props-story-form__actions">
            <Text type="secondary" className="props-field__label">
              操作
            </Text>
            <Space direction="vertical" size="small" style={{ width: "100%" }}>
              {isDraft && onConfirmStory && (
                <Button
                  type="primary"
                  block
                  disabled={busy || isDetached}
                  onClick={() => onConfirmStory(panelStory.id)}
                >
                  确认可执行
                </Button>
              )}
              {!isDraft &&
                !panelStory.passes &&
                panelStory.status === "ready" &&
                onUnconfirmStory && (
                  <Button
                    block
                    disabled={busy || isDetached}
                    onClick={() => {
                      confirmAction(
                        "退回草稿",
                        `将「${panelStory.title}」退回草稿？退回后不会进入执行队列。`,
                        () => onUnconfirmStory(panelStory.id)
                      );
                    }}
                  >
                    退回草稿
                  </Button>
                )}
              {canComplete && (
                <Button
                  type="primary"
                  block
                  disabled={busy || isDetached}
                  onClick={() => setCompleteOpen(true)}
                >
                  标记完成
                </Button>
              )}
              <StoryLifecycleActions
                story={panelStory}
                stories={userStories}
                progress={progress}
                busy={busy || isDetached}
                onRequestRemoval={onRequestRemoval}
                onCancelRemoval={onCancelRemoval}
                onArchiveStory={onArchiveStory}
                onDeleteStory={onDeleteStory}
              />
            </Space>
          </div>
        </Space>
      </PropsSectionCollapse>

      <PropsSectionCollapse
        storageKey="loop-props-section-deps"
        title="依赖与里程碑"
      >
        <Space direction="vertical" size="small" style={{ width: "100%" }}>
          <div className="props-field">
            <Text type="secondary" className="props-field__label">
              Milestone 标签
            </Text>
            {milestones.length > 0 && onAssignMilestone ? (
              <div className="props-milestone-chips">
                <MilestoneChip
                  active={!panelStory.milestoneId}
                  disabled={busy || isDetached}
                  onClick={() => onAssignMilestone(panelStory.id, null)}
                >
                  {MILESTONE_NONE_LABEL}
                </MilestoneChip>
                {milestones.map((m) => (
                  <MilestoneChip
                    key={m.id}
                    active={panelStory.milestoneId === m.id}
                    disabled={busy || isDetached}
                    onClick={() => onAssignMilestone(panelStory.id, m.id)}
                  >
                    {milestoneFullLabel(m)}
                  </MilestoneChip>
                ))}
              </div>
            ) : panelMilestone ? (
              <Text>{milestoneFullLabel(panelMilestone)}</Text>
            ) : (
              <Text type="secondary">—</Text>
            )}
          </div>
          {depsIn.length > 0 && (
            <div className="props-field">
              <Text type="secondary" className="props-field__label">
                依赖前置
              </Text>
              <ul className="props-list">
                {depsIn.map((id) => (
                  <li key={id}>
                    <code>{id}</code>
                    {storiesById.get(id)?.title && (
                      <Text type="secondary"> {storiesById.get(id)!.title}</Text>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {depsOut.length > 0 && (
            <div className="props-field">
              <Text type="secondary" className="props-field__label">
                阻塞
              </Text>
              <ul className="props-list">
                {depsOut.map((id) => (
                  <li key={id}>
                    <code>{id}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {panelStory.notes && (
            <div className="props-field">
              <Text type="secondary" className="props-field__label">
                备注
              </Text>
              <Text>{panelStory.notes}</Text>
            </div>
          )}
          {depsIn.length === 0 && depsOut.length === 0 && !panelStory.notes && (
            <Text type="secondary" className="props-story-form__hint">
              在脑图中拖连线建立 Story 依赖；Milestone 用于筛选与分组。
            </Text>
          )}
        </Space>
      </PropsSectionCollapse>

      <PropsSectionCollapse
        storageKey="loop-props-section-progress"
        title="进度日志"
      >
        <ProgressLog entries={displayProgress} showTitle={false} />
      </PropsSectionCollapse>

      <Modal
        open={completeOpen}
        title={`标记完成 · ${panelStory.id}`}
        okText="确认完成"
        cancelText="取消"
        okButtonProps={{ disabled: busy || !completeSummary.trim() }}
        onOk={submitComplete}
        onCancel={() => {
          setCompleteOpen(false);
          setCompleteSummary("");
        }}
      >
        <Space direction="vertical" size="small" style={{ width: "100%" }}>
          <Text type="secondary">
            简要说明本 Story 的实现内容，将写入进度日志。
          </Text>
          <TextArea
            rows={3}
            placeholder="例如：实现了分区属性面板与折叠持久化"
            value={completeSummary}
            disabled={busy}
            onChange={(e) => setCompleteSummary(e.target.value)}
          />
        </Space>
      </Modal>
    </>
  );
}

function kindLabel(kind: SelectedMindMapNode["kind"]): string {
  switch (kind) {
    case "root":
      return "项目";
    case "feature":
      return "Feature";
    case "story":
      return "Story";
    case "draft":
      return "Story · 草稿";
    case "done":
      return "Story · 已完成";
    case "blocked":
      return "Story · 阻塞";
    case "pending_removal":
      return "Story · 等待删除";
    case "archived":
      return "Story · 已归档";
    default:
      return kind;
  }
}

function StoryStatusTag({
  story,
  isBlocked,
}: {
  story: UserStory;
  isBlocked: boolean;
}) {
  if (story.removalRequestedAt) {
    return <Tag color="error">等待删除</Tag>;
  }
  if (story.passes) {
    return <Tag color="success">已完成</Tag>;
  }
  if (story.status === "draft") {
    return <Tag>草稿待确认</Tag>;
  }
  if (isBlocked) {
    return <Tag color="warning">等待依赖</Tag>;
  }
  return <Tag color="processing">可执行</Tag>;
}

function StoryLifecycleActions({
  story,
  stories,
  progress,
  busy,
  onRequestRemoval,
  onCancelRemoval,
  onArchiveStory,
  onDeleteStory,
}: {
  story: UserStory;
  stories: UserStory[];
  progress: ProgressEntry[];
  busy?: boolean;
  onRequestRemoval?: (storyId: string, reason?: string) => void;
  onCancelRemoval?: (storyId: string) => void;
  onArchiveStory?: (storyId: string, reason?: string) => void;
  onDeleteStory?: (storyId: string) => void;
}) {
  const [reason, setReason] = useState("");

  if (story.archivedAt) return null;

  const showRequest = canRequestRemoval(story, progress) && onRequestRemoval;
  const showCancel = canCancelRemoval(story) && onCancelRemoval;
  const showArchive = canArchiveStory(story, progress) && onArchiveStory;
  const showHardDelete =
    canHardDeleteStory(story.id, stories, progress) && onDeleteStory;

  if (!showRequest && !showCancel && !showArchive && !showHardDelete) {
    return null;
  }

  return (
    <section className="props-lifecycle">
      <Space direction="vertical" size="small" style={{ width: "100%" }}>
        {(showRequest || showArchive) && (
          <div className="props-field">
            <Text type="secondary" className="props-field__label">
              说明（写入进度日志）
            </Text>
            <TextArea
              rows={2}
              placeholder="可选"
              value={reason}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        )}
        <Space wrap className="props-lifecycle__actions">
          {showRequest && (
            <Button
              danger
              size="small"
              disabled={busy}
              onClick={() => {
                confirmAction(
                  "删除Story",
                  `标记「${story.title}」为等待删除？代码需由后续迭代回滚。`,
                  () => {
                    onRequestRemoval?.(story.id, reason.trim() || undefined);
                    setReason("");
                  }
                );
              }}
            >
              删除Story
            </Button>
          )}
          {showCancel && (
            <Button
              size="small"
              disabled={busy}
              onClick={() => onCancelRemoval?.(story.id)}
            >
              取消删除
            </Button>
          )}
          {showArchive && (
            <Button
              danger
              size="small"
              disabled={busy}
              onClick={() => {
                const content = story.removalRequestedAt
                  ? `确认归档「${story.title}」？将从脑图移除，进度保留。`
                  : `归档「${story.title}」？将从脑图移除，进度保留。`;
                confirmAction(
                  story.removalRequestedAt ? "确认归档" : "归档",
                  content,
                  () => {
                    onArchiveStory?.(story.id, reason.trim() || undefined);
                    setReason("");
                  }
                );
              }}
            >
              {story.removalRequestedAt ? "确认归档" : "归档"}
            </Button>
          )}
          {showHardDelete && (
            <Button
              danger
              size="small"
              disabled={busy}
              onClick={() => {
                confirmAction(
                  "删除 Story",
                  `确定删除未完成的 Story「${story.title}」？`,
                  () => onDeleteStory?.(story.id)
                );
              }}
            >
              删除 Story
            </Button>
          )}
        </Space>
        {isReopenedCompletedStory(story, progress) && !story.removalRequestedAt && (
          <Text type="secondary" className="props-lifecycle__hint">
            此 Story 曾已完成。继续迭代请保存为草稿或待实现；若不再需要该功能，请标记等待删除（归档需先标记）。
          </Text>
        )}
        {story.removalRequestedAt && (
          <Text type="secondary" className="props-lifecycle__hint">
            等待删除：请由 Agent 回滚代码后点「确认归档」。
          </Text>
        )}
      </Space>
    </section>
  );
}

function TrashList({
  stories,
  busy,
  onSelect,
}: {
  stories: UserStory[];
  busy?: boolean;
  onSelect?: (storyId: string) => void;
}) {
  if (stories.length === 0) return null;
  return (
    <section className="props-trash">
      <List
        size="small"
        header={
          <Text type="secondary" className="props-trash__title">
            回收站 ({stories.length})
          </Text>
        }
        dataSource={stories}
        renderItem={(s) => (
          <List.Item className="props-trash__item-wrap">
            <Button
              type="link"
              size="small"
              disabled={busy}
              className="props-trash__item"
              onClick={() => onSelect?.(s.id)}
            >
              <code>{s.id}</code>
              <span>{s.title}</span>
            </Button>
          </List.Item>
        )}
      />
    </section>
  );
}

function ProgressLog({
  entries,
  showTitle = true,
}: {
  entries: ProgressEntry[];
  showTitle?: boolean;
}) {
  return (
    <section className="props-progress">
      {showTitle && <h4 className="props-progress__title">进度日志</h4>}
      {entries.length === 0 ? (
        <Text type="secondary" className="props-progress__empty">
          暂无记录
        </Text>
      ) : (
        <div className="props-progress__list">
          {entries.map((e) => (
            <article
              key={e.id ?? `${e.entryDate}-${e.storyId}`}
              className="props-progress__entry"
            >
              <time className="props-progress__date">{e.entryDate}</time>
              {e.summary && (
                <p className="props-progress__summary">{e.summary}</p>
              )}
              {e.learnings?.length > 0 && (
                <ul className="props-progress__learnings">
                  {e.learnings.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function NodePropsPanel({
  selected,
  projectTitle,
  progressPct,
  features,
  userStories,
  milestones,
  dependencies,
  progress,
  busy,
  onAssignMilestone,
  onSetStoryPriority,
  onSetStoryPreferredTool,
  onAddFeature,
  onAddStory,
  onUpdateFeature,
  onUpdateStory,
  onCompleteStory,
  onDeleteStory,
  archivedStories = [],
  onRequestRemoval,
  onCancelRemoval,
  onArchiveStory,
  onRestoreStory,
  onPurgeStory,
  onConfirmStory,
  onUnconfirmStory,
  onSelectArchived,
  onSelectNode,
  onEditingChange,
}: Props) {
  const featuresById = new Map(features.map((f) => [f.id, f]));
  const storiesById = new Map(userStories.map((s) => [s.id, s]));
  const editingStateRef = useRef({ story: false, feature: false });

  const reportEditing = useCallback(() => {
    const { story, feature } = editingStateRef.current;
    onEditingChange?.(story || feature);
  }, [onEditingChange]);

  const handleStoryEditing = useCallback(
    (editing: boolean) => {
      editingStateRef.current.story = editing;
      reportEditing();
    },
    [reportEditing]
  );

  const handleFeatureEditing = useCallback(
    (editing: boolean) => {
      editingStateRef.current.feature = editing;
      reportEditing();
    },
    [reportEditing]
  );

  const [storyHeaderTitle, setStoryHeaderTitle] = useState("");

  useEffect(() => {
    editingStateRef.current = { story: false, feature: false };
    setStoryHeaderTitle("");
    onEditingChange?.(false);
  }, [selected?.id, selected?.kind, onEditingChange]);

  if (!selected) {
    return (
      <aside className="props-panel props-panel--empty">
        <Text type="secondary" className="props-panel__hint">
          从下方添加首个 Feature / Story，或点击脑图节点查看详情
        </Text>
        <AddActions
          busy={busy}
          onAddFeature={onAddFeature}
          onAddStory={onAddStory}
        />
      </aside>
    );
  }

  if (selected.kind === "root") {
    return (
      <aside className="props-panel">
        <header className="props-panel__head">
          <span className="props-panel__kind">项目</span>
          <h3 className="props-panel__title">{projectTitle}</h3>
        </header>
        <AddActions
          busy={busy}
          onAddFeature={onAddFeature}
          onAddStory={onAddStory}
        />
        <Descriptions
          className="props-dl"
          column={1}
          size="small"
          items={[
            { key: "progress", label: "进度", children: `${progressPct}%` },
            { key: "stories", label: "Stories", children: userStories.length },
            { key: "features", label: "Features", children: features.length },
          ]}
        />
        <TrashList
          stories={archivedStories}
          busy={busy}
          onSelect={onSelectArchived}
        />
      </aside>
    );
  }

  if (selected.kind === "feature") {
    const f = featuresById.get(selected.id);
    if (!f) {
      return (
        <aside className="props-panel props-panel--empty">
          <Text type="secondary" className="props-panel__hint">
            未找到 Feature
          </Text>
        </aside>
      );
    }

    const parentFeature = f.parentId ? featuresById.get(f.parentId) : null;
    const childStories = featureChildStories(f.id, userStories);
    const childFeatureCount = features.filter((x) => x.parentId === f.id).length;

    return (
      <aside className="props-panel props-panel--feature">
        <header className="props-panel__head">
          <span className="props-panel__kind props-panel__kind--feature">
            Feature
          </span>
          <h3 className="props-panel__title">{f.title}</h3>
          <code className="props-panel__id">{f.id}</code>
        </header>
        <FeatureSectionsPanel
          feature={f}
          parentFeature={parentFeature}
          childStories={childStories}
          childFeatureCount={childFeatureCount}
          busy={busy}
          onUpdateFeature={onUpdateFeature}
          onSelectNode={onSelectNode}
          onEditingChange={handleFeatureEditing}
        />
      </aside>
    );
  }

  if (selected.kind === "archived") {
    const archived = archivedStories.find((s) => s.id === selected.id);
    if (!archived) {
      return (
        <aside className="props-panel props-panel--empty">
          <Text type="secondary" className="props-panel__hint">
            未找到已归档 Story
          </Text>
        </aside>
      );
    }
    const storyProgress = progress
      .filter((e) => e.storyId === archived.id)
      .sort((a, b) => b.entryDate.localeCompare(a.entryDate));

    return (
      <aside className="props-panel">
        <header className="props-panel__head">
          <span className="props-panel__kind props-panel__kind--archived">
            {kindLabel(selected.kind)}
          </span>
          <h3 className="props-panel__title">{archived.title}</h3>
          <code className="props-panel__id">{archived.id}</code>
        </header>
        <Space wrap className="props-lifecycle__actions props-lifecycle__actions--padded">
          {canRestoreStory(archived) && onRestoreStory && (
            <Button
              type="primary"
              size="small"
              disabled={busy}
              onClick={() => onRestoreStory(archived.id)}
            >
              恢复
            </Button>
          )}
          {canPurgeStory(archived) && onPurgeStory && (
            <Button
              danger
              size="small"
              disabled={busy}
              onClick={() => {
                confirmAction(
                  "永久删除",
                  `永久删除「${archived.title}」及其全部进度记录？不可恢复。`,
                  () => onPurgeStory(archived.id)
                );
              }}
            >
              永久删除
            </Button>
          )}
        </Space>
        {archived.description && (
          <Descriptions
            className="props-dl"
            column={1}
            size="small"
            items={[
              { key: "desc", label: "描述", children: archived.description },
            ]}
          />
        )}
        <ProgressLog entries={storyProgress} />
      </aside>
    );
  }

  const story = storiesById.get(selected.id);
  if (!story) {
    return (
      <aside className="props-panel props-panel--empty">
        <Text type="secondary" className="props-panel__hint">
          未找到 Story
        </Text>
      </aside>
    );
  }

  const depsIn = dependencies.filter((d) => d.to === story.id).map((d) => d.from);
  const depsOut = dependencies.filter((d) => d.from === story.id).map((d) => d.to);
  const isBlocked =
    !story.passes && story.status === "ready" && selected.kind === "blocked";
  const isPendingRemoval = selected.kind === "pending_removal";
  const isDraft = !story.passes && story.status === "draft";
  const storyProgress = progress
    .filter((e) => e.storyId === story.id)
    .sort((a, b) => b.entryDate.localeCompare(a.entryDate));
  const headerTitle = storyHeaderTitle || story.title;

  return (
    <aside className="props-panel props-panel--story">
      <header className="props-panel__head">
        <span
          className={`props-panel__kind props-panel__kind--story${story.passes ? " props-panel__kind--done" : isDraft ? " props-panel__kind--draft" : isBlocked ? " props-panel__kind--blocked" : isPendingRemoval ? " props-panel__kind--pending-removal" : ""}`}
        >
          {kindLabel(selected.kind)}
        </span>
        <h3 className="props-panel__title">{headerTitle}</h3>
        <code className="props-panel__id">{story.id}</code>
      </header>

      <StorySectionsPanel
        key={story.id}
        story={story}
        busy={busy}
        isBlocked={isBlocked}
        milestones={milestones}
        depsIn={depsIn}
        depsOut={depsOut}
        storiesById={storiesById}
        storyProgress={storyProgress}
        onUpdateStory={onUpdateStory}
        onCompleteStory={onCompleteStory}
        onAssignMilestone={onAssignMilestone}
        onSetStoryPriority={onSetStoryPriority}
        onSetStoryPreferredTool={onSetStoryPreferredTool}
        onConfirmStory={onConfirmStory}
        onUnconfirmStory={onUnconfirmStory}
        onRequestRemoval={onRequestRemoval}
        onCancelRemoval={onCancelRemoval}
        onArchiveStory={onArchiveStory}
        onDeleteStory={onDeleteStory}
        userStories={userStories}
        progress={progress}
        onEditingChange={handleStoryEditing}
        onHeaderTitleChange={setStoryHeaderTitle}
      />
    </aside>
  );
}
