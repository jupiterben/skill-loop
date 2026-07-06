import { Button, Card, Descriptions, Progress, Tag, Typography } from "antd";
import type { LoopRun, ProjectStatus, UserStory } from "../types";

const { Paragraph, Text } = Typography;

interface Props {
  status: ProjectStatus;
  draftStories?: UserStory[];
  userStories?: UserStory[];
  onConfirmStory?: (storyId: string) => void;
  busy?: boolean;
  loopRunner?: {
    running: boolean;
    stopRequested: boolean;
  };
}

function ExecutingStory({
  story,
  activeRun,
  stopRequested,
}: {
  story: UserStory;
  activeRun: LoopRun | null;
  stopRequested?: boolean;
}) {
  return (
    <div className="executing-story" role="status" aria-live="polite">
      <div className="executing-story__pulse" aria-hidden />
      <div className="executing-story__body">
        <div className="executing-story__label">
          <span className="executing-story__dot" aria-hidden />
          执行中
          {activeRun?.iteration != null && (
            <span className="executing-story__iter">
              第 {activeRun.iteration} 轮
            </span>
          )}
          {activeRun?.tool && (
            <span className="executing-story__tool">{activeRun.tool}</span>
          )}
        </div>
        <div className="executing-story__task">
          <code>{story.id}</code> {story.title}
        </div>
        {stopRequested && (
          <Text type="secondary" className="executing-story__hint">
            已请求停止，当前轮结束后退出…
          </Text>
        )}
      </div>
    </div>
  );
}

export function ProjectCard({
  status,
  draftStories = [],
  userStories = [],
  onConfirmStory,
  busy,
  loopRunner,
}: Props) {
  const total = status.totalStories ?? 0;
  const completed = status.completedStories ?? 0;
  const pending = status.pendingStories ?? 0;
  const featureCount = status.totalFeatures ?? 0;
  const pct = total ? Math.round((completed / total) * 100) : 0;
  const next = status.nextStory;
  const executingRuns =
    status.activeRuns && status.activeRuns.length > 0
      ? status.activeRuns
      : status.activeRun?.status === "running"
        ? [status.activeRun]
        : [];
  const executingRunItems = executingRuns
    .map((run) => {
      const id = run.storyId;
      if (!id) return null;
      const story =
        userStories.find((s) => s.id === id) ??
        (status.currentStory?.id === id
          ? status.currentStory
          : ({ id, title: id } as UserStory));
      return { run, story };
    })
    .filter(Boolean) as { run: LoopRun; story: UserStory }[];
  const executing = status.currentStory ?? executingRunItems[0]?.story ?? null;
  const isRunning =
    status.activeRun?.status === "running" || loopRunner?.running === true;

  return (
    <Card className="card project-card" size="small" title={status.project}>
      <Paragraph type="secondary" className="project-desc">
        {status.description || "—"}
      </Paragraph>
      <Descriptions
        className="project-meta"
        column={1}
        size="small"
        items={[
          { key: "branch", label: "分支", children: status.branchName },
          {
            key: "stories",
            label: "Stories",
            children: (
              <>
                待做 <Text strong>{pending}</Text> / 共 <Text strong>{total}</Text>
                {status.blockedStories > 0 && (
                  <>
                    {" "}
                    （<Text strong>{status.blockedStories}</Text> 被依赖阻塞）
                  </>
                )}
                {(status.draftStories ?? 0) > 0 && (
                  <>
                    {" "}
                    （<Text strong>{status.draftStories}</Text> 草稿待确认）
                  </>
                )}
              </>
            ),
          },
          ...(featureCount > 0
            ? [
                {
                  key: "features",
                  label: "Feature",
                  children: featureCount,
                },
              ]
            : []),
        ]}
      />
      <Progress
        className="project-progress"
        percent={pct}
        size="small"
        format={() => `${completed} / ${total} (${pct}%)`}
      />
      {isRunning && executingRunItems.length > 1 ? (
        <div className="executing-story-list">
          {executingRunItems.map(({ run, story }) => (
            <ExecutingStory
              key={run.id ?? `${run.workerId ?? "run"}-${run.startedAt}`}
              story={story}
              activeRun={run}
              stopRequested={loopRunner?.stopRequested}
            />
          ))}
        </div>
      ) : isRunning && executing ? (
        <ExecutingStory
          story={executing}
          activeRun={executingRunItems[0]?.run ?? status.activeRun}
          stopRequested={loopRunner?.stopRequested}
        />
      ) : isRunning ? (
        <div className="executing-story executing-story--idle" role="status">
          <div className="executing-story__pulse" aria-hidden />
          <div className="executing-story__body">
            <div className="executing-story__label">
              <span className="executing-story__dot" aria-hidden />
              外循环运行中…
            </div>
          </div>
        </div>
      ) : null}
      {draftStories.length > 0 && (
        <div className="project-drafts">
          <Text type="secondary" className="project-drafts__label">
            草稿待确认
          </Text>
          <ul className="project-drafts__list">
            {draftStories.map((story) => (
              <li key={story.id} className="project-drafts__item">
                <span className="project-drafts__text">
                  <code>{story.id}</code> {story.title}
                </span>
                {onConfirmStory && (
                  <Button
                    type="primary"
                    size="small"
                    disabled={busy}
                    onClick={() => onConfirmStory(story.id)}
                  >
                    确认可执行
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!isRunning && next ? (
        <div className="next-story">
          下一任务：<Text strong>{next.id}</Text> {next.title}
        </div>
      ) : !isRunning && status.isComplete ? (
        <Tag color="success" className="next-story next-story--done">
          全部完成
        </Tag>
      ) : !isRunning && draftStories.length > 0 ? (
        <Text type="secondary" className="next-story">
          确认草稿后才会进入执行队列
        </Text>
      ) : null}
    </Card>
  );
}
