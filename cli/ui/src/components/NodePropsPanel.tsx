import { useEffect, useState } from "react";
import {
  Button,
  Descriptions,
  Input,
  InputNumber,
  List,
  Modal,
  Space,
  Tag,
  Typography,
} from "antd";
import type {
  Feature,
  Milestone,
  ProgressEntry,
  SelectedMindMapNode,
  StoryDependency,
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
import {
  acceptanceCriteriaEqual,
  formatAcceptanceCriteria,
  parseAcceptanceCriteria,
} from "../lib/acceptanceCriteria";

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

function FeatureEditor({
  feature,
  busy,
  onUpdateFeature,
}: {
  feature: Feature;
  busy?: boolean;
  onUpdateFeature?: (input: {
    id: string;
    title: string;
    description: string;
  }) => void;
}) {
  const [title, setTitle] = useState(feature.title);
  const [description, setDescription] = useState(feature.description);

  useEffect(() => {
    setTitle(feature.title);
    setDescription(feature.description);
  }, [feature.id, feature.title, feature.description]);

  const dirty =
    title.trim() !== feature.title || description !== feature.description;

  return (
    <section className="props-story-form">
      <Space direction="vertical" size="small" style={{ width: "100%" }}>
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
        {onUpdateFeature && (
          <Button
            type="primary"
            block
            disabled={busy || !title.trim() || !dirty}
            onClick={() =>
              onUpdateFeature({
                id: feature.id,
                title: title.trim(),
                description,
              })
            }
          >
            保存
          </Button>
        )}
      </Space>
    </section>
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

  useEffect(() => {
    setValue(story.priority);
  }, [story.id, story.priority]);

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

function StoryEditor({
  story,
  busy,
  onUpdateStory,
}: {
  story: UserStory;
  busy?: boolean;
  onUpdateStory?: (input: {
    storyId: string;
    title: string;
    description: string;
    acceptanceCriteria: string[];
    changeNote?: string;
    status: "draft" | "ready";
  }) => void;
}) {
  const [title, setTitle] = useState(story.title);
  const [description, setDescription] = useState(story.description);
  const [acceptanceCriteria, setAcceptanceCriteria] = useState(
    () => formatAcceptanceCriteria(story.acceptanceCriteria)
  );
  const [changeNote, setChangeNote] = useState("");

  useEffect(() => {
    setTitle(story.title);
    setDescription(story.description);
    setAcceptanceCriteria(formatAcceptanceCriteria(story.acceptanceCriteria));
    setChangeNote("");
  }, [story.id, story.title, story.description, story.acceptanceCriteria]);

  const parsedAcceptanceCriteria = parseAcceptanceCriteria(acceptanceCriteria);
  const dirty =
    title.trim() !== story.title ||
    description !== story.description ||
    !acceptanceCriteriaEqual(parsedAcceptanceCriteria, story.acceptanceCriteria);
  const canSave = Boolean(onUpdateStory) && (dirty || story.passes);

  const submit = (status: "draft" | "ready") => {
    onUpdateStory?.({
      storyId: story.id,
      title: title.trim(),
      description,
      acceptanceCriteria: parsedAcceptanceCriteria,
      changeNote: changeNote.trim() || undefined,
      status,
    });
  };

  return (
    <section className="props-story-form">
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
            验收标准
          </Text>
          <TextArea
            rows={3}
            placeholder="每行一条，例如：npm test 通过"
            value={acceptanceCriteria}
            disabled={busy}
            onChange={(e) => setAcceptanceCriteria(e.target.value)}
          />
        </div>
        {canSave && (
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
        )}
        {canSave && (
          <Space direction="vertical" size="small" style={{ width: "100%" }}>
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
        )}
        {canSave && (
          <Text type="secondary" className="props-story-form__hint">
            {story.passes
              ? "修改后将重置完成状态并记入进度日志。"
              : "保存为草稿需确认后才可执行；保存为待实现将进入执行队列。"}
          </Text>
        )}
      </Space>
    </section>
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

function ProgressLog({ entries }: { entries: ProgressEntry[] }) {
  return (
    <section className="props-progress">
      <h4 className="props-progress__title">进度日志</h4>
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
  onAddFeature,
  onAddStory,
  onUpdateFeature,
  onUpdateStory,
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
}: Props) {
  const featuresById = new Map(features.map((f) => [f.id, f]));
  const storiesById = new Map(userStories.map((s) => [s.id, s]));

  if (!selected) {
    return (
      <aside className="props-panel props-panel--empty">
        <Text type="secondary" className="props-panel__hint">
          点击项目或 Feature 节点可添加子项
          <br />
          点击 Story 查看属性与进度
        </Text>
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

    return (
      <aside className="props-panel">
        <header className="props-panel__head">
          <span className="props-panel__kind props-panel__kind--feature">
            Feature
          </span>
        </header>
        <FeatureEditor
          feature={f}
          busy={busy}
          onUpdateFeature={onUpdateFeature}
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

  const milestone = story.milestoneId
    ? milestones.find((m) => m.id === story.milestoneId)
    : null;
  const depsIn = dependencies.filter((d) => d.to === story.id).map((d) => d.from);
  const depsOut = dependencies.filter((d) => d.from === story.id).map((d) => d.to);
  const isBlocked =
    !story.passes && story.status === "ready" && selected.kind === "blocked";
  const isPendingRemoval = selected.kind === "pending_removal";
  const isDraft = !story.passes && story.status === "draft";
  const storyProgress = progress
    .filter((e) => e.storyId === story.id)
    .sort((a, b) => b.entryDate.localeCompare(a.entryDate));

  const detailItems = [
    {
      key: "priority",
      label: "优先级",
      children: (
        <PriorityEditor
          story={story}
          busy={busy}
          onSetPriority={onSetStoryPriority}
        />
      ),
    },
    {
      key: "status",
      label: "状态",
      children: <StoryStatusTag story={story} isBlocked={isBlocked} />,
    },
    {
      key: "milestone",
      label: "Milestone 标签",
      children:
        milestones.length > 0 && onAssignMilestone ? (
          <div className="props-milestone-chips">
            <MilestoneChip
              active={!story.milestoneId}
              disabled={busy}
              onClick={() => onAssignMilestone(story.id, null)}
            >
              {MILESTONE_NONE_LABEL}
            </MilestoneChip>
            {milestones.map((m) => (
              <MilestoneChip
                key={m.id}
                active={story.milestoneId === m.id}
                disabled={busy}
                onClick={() => onAssignMilestone(story.id, m.id)}
              >
                {m.title}
              </MilestoneChip>
            ))}
          </div>
        ) : milestone ? (
          milestone.title
        ) : (
          "—"
        ),
    },
    ...(depsIn.length > 0
      ? [
          {
            key: "depsIn",
            label: "依赖前置",
            children: (
              <ul className="props-list">
                {depsIn.map((id) => (
                  <li key={id}>
                    <code>{id}</code>
                    {storiesById.get(id)?.title && (
                      <Text type="secondary">
                        {" "}
                        {storiesById.get(id)!.title}
                      </Text>
                    )}
                  </li>
                ))}
              </ul>
            ),
          },
        ]
      : []),
    ...(depsOut.length > 0
      ? [
          {
            key: "depsOut",
            label: "阻塞",
            children: (
              <ul className="props-list">
                {depsOut.map((id) => (
                  <li key={id}>
                    <code>{id}</code>
                  </li>
                ))}
              </ul>
            ),
          },
        ]
      : []),
    ...(story.notes
      ? [{ key: "notes", label: "备注", children: story.notes }]
      : []),
  ];

  return (
    <aside className="props-panel">
      <header className="props-panel__head">
        <span
          className={`props-panel__kind props-panel__kind--story${story.passes ? " props-panel__kind--done" : isDraft ? " props-panel__kind--draft" : isBlocked ? " props-panel__kind--blocked" : isPendingRemoval ? " props-panel__kind--pending-removal" : ""}`}
        >
          {kindLabel(selected.kind)}
        </span>
        <h3 className="props-panel__title">{story.title}</h3>
        <code className="props-panel__id">{story.id}</code>
        {isDraft && onConfirmStory && (
          <Button
            type="primary"
            size="small"
            className="props-panel__confirm"
            disabled={busy}
            onClick={() => onConfirmStory(story.id)}
          >
            确认可执行
          </Button>
        )}
        {!isDraft &&
          !story.passes &&
          story.status === "ready" &&
          onUnconfirmStory && (
            <Button
              size="small"
              className="props-panel__confirm"
              disabled={busy}
              onClick={() => {
                confirmAction(
                  "退回草稿",
                  `将「${story.title}」退回草稿？退回后不会进入执行队列。`,
                  () => onUnconfirmStory(story.id)
                );
              }}
            >
              退回草稿
            </Button>
          )}
      </header>

      <StoryEditor
        story={story}
        busy={busy}
        onUpdateStory={onUpdateStory}
      />

      <StoryLifecycleActions
        story={story}
        stories={userStories}
        progress={progress}
        busy={busy}
        onRequestRemoval={onRequestRemoval}
        onCancelRemoval={onCancelRemoval}
        onArchiveStory={onArchiveStory}
        onDeleteStory={onDeleteStory}
      />

      <Descriptions
        className="props-dl"
        column={1}
        size="small"
        items={detailItems}
      />

      <ProgressLog entries={storyProgress} />
    </aside>
  );
}
