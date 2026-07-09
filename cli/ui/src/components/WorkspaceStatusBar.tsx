import { Progress, Tag, Typography } from "antd";
import type { LoopRun, ProjectStatus, UserStory } from "../types";

const { Text } = Typography;

interface Props {
  status: ProjectStatus;
  userStories: UserStory[];
  loopRunner?: {
    running: boolean;
    stopRequested: boolean;
  };
}

function resolveStory(
  id: string,
  userStories: UserStory[],
  currentStory: ProjectStatus["currentStory"]
): UserStory {
  return (
    userStories.find((s) => s.id === id) ??
    (currentStory?.id === id
      ? currentStory
      : ({ id, title: id } as UserStory))
  );
}

export function WorkspaceStatusBar({ status, userStories, loopRunner }: Props) {
  const total = status.totalStories ?? 0;
  const completed = status.completedStories ?? 0;
  const pct = total ? Math.round((completed / total) * 100) : 0;
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
      return {
        run,
        story: resolveStory(id, userStories, status.currentStory),
      };
    })
    .filter(Boolean) as { run: LoopRun; story: UserStory }[];
  const isRunning =
    status.activeRun?.status === "running" || loopRunner?.running === true;
  const executing =
    status.currentStory ?? executingRunItems[0]?.story ?? null;
  const next = status.nextStory;

  return (
    <footer className="app-workspace__status" role="status" aria-live="polite">
      <div className="workspace-status__track">
        <Progress
          percent={pct}
          size="small"
          showInfo={false}
          strokeColor={{
            "0%": "#5b9cf5",
            "100%": "#3dd68c",
          }}
          className="workspace-status__progress"
        />
      </div>
      <div className="workspace-status__content">
      {isRunning && executingRunItems.length > 1 ? (
        <div className="workspace-status workspace-status--running">
          <span className="workspace-status__dot" aria-hidden />
          <Text strong className="workspace-status__label">
            并行执行中
          </Text>
          <Text type="secondary" className="workspace-status__detail">
            {executingRunItems
              .map(({ run, story }) => {
                const worker = run.workerId ? `${run.workerId} · ` : "";
                return `${worker}${story.id} ${story.title}`;
              })
              .join(" · ")}
          </Text>
          {loopRunner?.stopRequested && (
            <Text type="secondary" className="workspace-status__hint">
              已请求停止…
            </Text>
          )}
        </div>
      ) : isRunning && executing ? (
        <div className="workspace-status workspace-status--running">
          <span className="workspace-status__dot" aria-hidden />
          <Text strong className="workspace-status__label">
            执行中
          </Text>
          <Text className="workspace-status__detail">
            <code>{executing.id}</code> {executing.title}
          </Text>
          {executingRunItems[0]?.run && (
            <Text type="secondary" className="workspace-status__meta">
              第 {executingRunItems[0].run.iteration} 轮
              {executingRunItems[0].run.tool && (
                <> · {executingRunItems[0].run.tool}</>
              )}
              {executingRunItems[0].run.workerId && (
                <> · {executingRunItems[0].run.workerId}</>
              )}
            </Text>
          )}
          {loopRunner?.stopRequested && (
            <Text type="secondary" className="workspace-status__hint">
              已请求停止，当前轮结束后退出…
            </Text>
          )}
        </div>
      ) : isRunning ? (
        <div className="workspace-status workspace-status--running">
          <span className="workspace-status__dot" aria-hidden />
          <Text strong className="workspace-status__label">
            外循环运行中
          </Text>
        </div>
      ) : status.isComplete ? (
        <Tag color="success" className="workspace-status__tag">
          全部 Story 已完成
        </Tag>
      ) : next ? (
        <Text type="secondary" className="workspace-status__idle">
          就绪 · 下一任务 <Text strong>{next.id}</Text> {next.title}
        </Text>
      ) : (
        <Text type="secondary" className="workspace-status__idle">
          就绪 · 暂无待执行 Story
        </Text>
      )}
      </div>
    </footer>
  );
}
