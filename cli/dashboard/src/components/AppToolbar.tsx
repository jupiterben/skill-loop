import { Progress, Tag, Typography } from "antd";
import { resolveAppToolbarView } from "../features/app-toolbar/appToolbarView";
import type { ProjectStatus } from "../types";

const { Text } = Typography;

interface Props {
  status: ProjectStatus;
}

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  return (
    <span className={`app-toolbar__stat app-toolbar__stat--${tone ?? "default"}`}>
      <span className="app-toolbar__stat-value">{value}</span>
      <span className="app-toolbar__stat-label">{label}</span>
    </span>
  );
}

export function AppToolbar({ status }: Props) {
  const view = resolveAppToolbarView(status);
  const {
    project,
    branchName,
    completed,
    pending,
    blocked,
    drafts,
    total,
    progressPct,
    showRunning,
    showComplete,
  } = view;

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
            {project}
          </Text>
        </div>
      </div>

      <div className="app-toolbar__stats">
        <StatPill label="完成" value={completed} tone="success" />
        <StatPill label="待做" value={pending} />
        {blocked > 0 && (
          <StatPill label="阻塞" value={blocked} tone="warning" />
        )}
        {drafts > 0 && (
          <StatPill label="草稿" value={drafts} tone="warning" />
        )}
      </div>

      <div className="app-toolbar__meta">
        <Tag className="app-toolbar__tag app-toolbar__tag--branch">
          {branchName}
        </Tag>
        {showRunning && (
          <Tag color="processing" className="app-toolbar__tag">
            <span className="app-toolbar__live-dot" aria-hidden />
            运行中
          </Tag>
        )}
        {showComplete && (
          <Tag color="success" className="app-toolbar__tag">
            全部完成
          </Tag>
        )}
      </div>

      <div className="app-toolbar__progress">
        <div className="app-toolbar__progress-text">
          <Text type="secondary" className="app-toolbar__progress-label">
            进度
          </Text>
          <Text strong className="app-toolbar__progress-pct">
            {progressPct}%
          </Text>
        </div>
        <Progress
          percent={progressPct}
          size="small"
          showInfo={false}
          strokeColor={{
            "0%": "#5b9cf5",
            "100%": "#3dd68c",
          }}
          className="app-toolbar__progress-bar"
        />
        <Text type="secondary" className="app-toolbar__progress-count">
          {completed}/{total}
        </Text>
      </div>
    </header>
  );
}
