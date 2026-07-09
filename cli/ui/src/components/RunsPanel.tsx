import { List, Tag, Typography } from "antd";
import type { LoopRun } from "../types";
import { fmtTime } from "../lib/format";
import { SidebarCollapse } from "./SidebarCollapse";

const { Text } = Typography;

const STORAGE_KEY = "loop-runs-panel-open";

function runStatusColor(
  status: LoopRun["status"]
): "success" | "processing" | "error" | "warning" | "default" {
  switch (status) {
    case "completed":
      return "success";
    case "running":
      return "processing";
    case "failed":
      return "error";
    case "max_iterations":
      return "warning";
    default:
      return "default";
  }
}

const STATUS_LABEL: Record<LoopRun["status"], string> = {
  running: "运行中",
  completed: "已完成",
  failed: "失败",
  max_iterations: "达上限",
};

function RunsList({ runs }: { runs: LoopRun[] }) {
  if (!runs.length) {
    return (
      <div className="runs-panel__empty">
        <Text type="secondary">暂无迭代记录</Text>
        <Text type="secondary" className="runs-panel__empty-hint">
          执行 loop run 后将在此显示历史
        </Text>
      </div>
    );
  }

  return (
    <List
      className="runs-compact"
      size="small"
      dataSource={runs}
      renderItem={(r) => (
        <List.Item className="runs-compact__item">
          <div className="runs-compact__content">
            <div className="runs-compact__head">
              <span className="runs-compact__iter">#{r.iteration}</span>
              <Tag color={runStatusColor(r.status)}>
                {STATUS_LABEL[r.status] ?? r.status}
              </Tag>
            </div>
            {r.storyId && (
              <Text className="runs-compact__story">
                <code>{r.storyId}</code>
              </Text>
            )}
            <Text type="secondary" className="runs-compact__meta">
              {r.tool ?? "—"}
              <span className="runs-compact__dot">·</span>
              {fmtTime(r.startedAt)}
              {r.endedAt && (
                <>
                  <span className="runs-compact__dot">→</span>
                  {fmtTime(r.endedAt)}
                </>
              )}
            </Text>
          </div>
        </List.Item>
      )}
    />
  );
}

interface Props {
  runs: LoopRun[];
}

export function RunsPanel({ runs }: Props) {
  return (
    <SidebarCollapse
      storageKey={STORAGE_KEY}
      defaultOpen={false}
      title="外循环迭代"
      count={runs.length}
      className="runs-panel"
    >
      <RunsList runs={runs} />
    </SidebarCollapse>
  );
}
