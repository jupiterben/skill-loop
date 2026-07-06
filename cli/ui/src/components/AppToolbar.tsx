import { Progress, Tag, Typography } from "antd";
import type { ProjectStatus } from "../types";

const { Text } = Typography;

interface Props {
  status: ProjectStatus;
}

export function AppToolbar({ status }: Props) {
  const total = status.totalStories ?? 0;
  const completed = status.completedStories ?? 0;
  const pct = total ? Math.round((completed / total) * 100) : 0;
  const loopRunning =
    status.activeRun?.status === "running" ||
    (status.activeRuns?.length ?? 0) > 0;

  return (
    <header className="app-toolbar">
      <div className="app-toolbar__brand">
        <span className="app-toolbar__logo" aria-hidden>
          ◈
        </span>
        <div className="app-toolbar__titles">
          <Text strong className="app-toolbar__app-name">
            Loop Dashboard
          </Text>
          <Text type="secondary" className="app-toolbar__project">
            {status.project}
          </Text>
        </div>
      </div>
      <div className="app-toolbar__meta">
        <Tag className="app-toolbar__tag">{status.branchName}</Tag>
        {loopRunning && (
          <Tag color="processing" className="app-toolbar__tag">
            外循环运行中
          </Tag>
        )}
        {status.isComplete && (
          <Tag color="success" className="app-toolbar__tag">
            全部完成
          </Tag>
        )}
      </div>
      <div className="app-toolbar__progress">
        <Text type="secondary" className="app-toolbar__progress-label">
          {completed}/{total} Stories
        </Text>
        <Progress
          percent={pct}
          size="small"
          showInfo={false}
          className="app-toolbar__progress-bar"
        />
        <Text strong className="app-toolbar__progress-pct">
          {pct}%
        </Text>
      </div>
    </header>
  );
}
