import { useEffect, useRef } from "react";
import { Tag, Typography } from "antd";
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

interface Props {
  runLive: RunLiveState | null | undefined;
  isRunning?: boolean;
}

export function AgentLivePanel({ runLive, isRunning }: Props) {
  const outputRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = outputRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [runLive?.output, runLive?.updatedAt]);

  if (!runLive) return null;

  const showPulse = isRunning && runLive.phase === "invoking";

  return (
    <section className="card card--agent-live" aria-live="polite">
      <div className="agent-live__head">
        <h2>Agent 输出</h2>
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
      </div>
      <pre ref={outputRef} className="agent-live__output">
        {runLive.output || (
          <span className="agent-live__placeholder">等待 Agent 输出…</span>
        )}
      </pre>
    </section>
  );
}
