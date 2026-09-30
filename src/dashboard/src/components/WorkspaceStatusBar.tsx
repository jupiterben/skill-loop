import { Progress, Tag, Typography } from "antd";
import { resolveWorkspaceStatusView } from "../features/workspace-status/workspaceStatus";
import type { ProjectStatus, UserStory } from "../types";

const { Text } = Typography;

interface Props {
  status: ProjectStatus;
  userStories: UserStory[];
  loopRunner?: {
    running: boolean;
    stopRequested: boolean;
  };
}

export function WorkspaceStatusBar({ status, userStories, loopRunner }: Props) {
  const total = status.totalStories ?? 0;
  const completed = status.completedStories ?? 0;
  const pct = total ? Math.round((completed / total) * 100) : 0;
  const view = resolveWorkspaceStatusView(status, userStories, loopRunner);

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
      {view.kind === "parallel" ? (
        <div className="workspace-status workspace-status--running">
          <span className="workspace-status__dot" aria-hidden />
          <Text strong className="workspace-status__label">
            并行执行中
          </Text>
          <Text type="secondary" className="workspace-status__detail">
            {view.items
              .map((item) => {
                const worker = item.workerId ? `${item.workerId} · ` : "";
                return `${worker}${item.storyId} ${item.title}`;
              })
              .join(" · ")}
          </Text>
          {view.stopRequested && (
            <Text type="secondary" className="workspace-status__hint">
              已请求停止…
            </Text>
          )}
        </div>
      ) : view.kind === "running" ? (
        <div className="workspace-status workspace-status--running">
          <span className="workspace-status__dot" aria-hidden />
          <Text strong className="workspace-status__label">
            执行中
          </Text>
          <Text className="workspace-status__detail">
            <code>{view.storyId}</code> {view.title}
          </Text>
          {view.iteration != null && (
            <Text type="secondary" className="workspace-status__meta">
              第 {view.iteration} 轮
              {view.tool && <> · {view.tool}</>}
              {view.workerId && <> · {view.workerId}</>}
            </Text>
          )}
          {view.stopRequested && (
            <Text type="secondary" className="workspace-status__hint">
              已请求停止，当前轮结束后退出…
            </Text>
          )}
        </div>
      ) : view.kind === "runner-only" ? (
        <div className="workspace-status workspace-status--running">
          <span className="workspace-status__dot" aria-hidden />
          <Text strong className="workspace-status__label">
            外循环运行中
          </Text>
        </div>
      ) : view.kind === "complete" ? (
        <Tag color="success" className="workspace-status__tag">
          全部 Story 已完成
        </Tag>
      ) : view.kind === "ready" ? (
        <Text type="secondary" className="workspace-status__idle">
          就绪 · 下一任务 <Text strong>{view.nextId}</Text> {view.nextTitle}
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
