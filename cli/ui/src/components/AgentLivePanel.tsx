import { useEffect, useRef, useState } from "react";
import { Tabs, Tag, Typography } from "antd";
import type { RunLivePhase, RunLiveState } from "../types";

const { Text } = Typography;

const PHASE_LABEL: Record<RunLivePhase, string> = {
  starting: "准备中",
  invoking: "执行中",
  between: "轮间等待",
  done: "已结束",
};

function phaseColor(
  phase: RunLivePhase
): "processing" | "success" | "default" | "warning" {
  switch (phase) {
    case "invoking":
      return "processing";
    case "done":
      return "success";
    case "between":
      return "warning";
    default:
      return "default";
  }
}

function LiveOutput({
  runLive,
  isRunning,
}: {
  runLive: RunLiveState;
  isRunning?: boolean;
}) {
  const outputRef = useRef<HTMLPreElement>(null);
  const showPulse = isRunning && runLive.phase === "invoking";

  useEffect(() => {
    const el = outputRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [runLive.output, runLive.updatedAt]);

  return (
    <div className="agent-live">
      <div className="agent-live__meta">
        <Tag color={phaseColor(runLive.phase)}>
          {showPulse && <span className="agent-live__pulse" aria-hidden />}
          {PHASE_LABEL[runLive.phase]}
        </Tag>
        <Text type="secondary" className="agent-live__detail">
          第 {runLive.iteration} 轮
          {runLive.tool && <> · {runLive.tool}</>}
          {runLive.storyId && (
            <>
              {" "}
              · <code>{runLive.storyId}</code>
            </>
          )}
        </Text>
      </div>
      <pre ref={outputRef} className="agent-live__output">
        {runLive.output || (
          <span className="agent-live__placeholder">等待 Agent 输出…</span>
        )}
      </pre>
    </div>
  );
}

function IdlePlaceholder({ isRunning }: { isRunning?: boolean }) {
  return (
    <div className="agent-live__idle">
      <Text type="secondary" className="agent-live__placeholder">
        {isRunning
          ? "外循环已启动，等待 Agent 输出…"
          : "运行 loop run 后，Agent 实时输出将显示在此"}
      </Text>
    </div>
  );
}

interface Props {
  runLive: RunLiveState | null | undefined;
  runLiveWorkers?: RunLiveState[];
  isRunning?: boolean;
}

export function AgentLivePanel({ runLive, runLiveWorkers, isRunning }: Props) {
  const workers =
    runLiveWorkers && runLiveWorkers.length > 0
      ? runLiveWorkers
      : runLive
        ? [runLive]
        : [];
  const [activeKey, setActiveKey] = useState(workers[0]?.workerId ?? "0");

  useEffect(() => {
    if (!workers.length) return;
    const exists = workers.some((w) => (w.workerId ?? "0") === activeKey);
    if (!exists) {
      setActiveKey(workers[0]?.workerId ?? "0");
    }
  }, [workers, activeKey]);

  if (!workers.length) {
    return <IdlePlaceholder isRunning={isRunning} />;
  }

  if (workers.length === 1) {
    const single = workers[0]!;
    return <LiveOutput runLive={single} isRunning={isRunning} />;
  }

  return (
    <Tabs
      activeKey={activeKey}
      onChange={setActiveKey}
      size="small"
      className="agent-live__tabs"
      items={workers.map((w, index) => {
        const key =
          w.workerId ??
          (w.storyId ? `${w.storyId}-${index}` : String(w.iteration));
        return {
          key,
          label: (
            <span>
              {w.workerId ?? key}
              {w.storyId ? ` · ${w.storyId}` : ""}
            </span>
          ),
          children: <LiveOutput runLive={w} isRunning={isRunning} />,
        };
      })}
    />
  );
}
