import { useState } from "react";
import {
  Button,
  InputNumber,
  Popover,
  Radio,
  Select,
  Space,
  Typography,
} from "antd";
import {
  LOOP_RUN_TOOLS,
  type LoopRunStartInput,
  type LoopRunTool,
  buildStartLoopRunPayload,
  clampWorkers,
  resolveLoopRunControlView,
} from "./loopRunControlView";
import type { DashboardData } from "../../types";

const { Text } = Typography;

interface Props {
  loopRunner?: DashboardData["loopRunner"];
  busy?: boolean;
  onStart: (input: LoopRunStartInput) => Promise<void>;
  onStop: () => Promise<void>;
}

export function LoopRunControl({ loopRunner, busy, onStart, onStop }: Props) {
  const view = resolveLoopRunControlView(loopRunner);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tool, setTool] = useState<LoopRunTool>("agent");
  const [workers, setWorkers] = useState(1);
  const [mode, setMode] = useState<"until-stop" | "limited">("until-stop");
  const [maxIterations, setMaxIterations] = useState(10);

  const handleStart = async () => {
    const input: LoopRunStartInput = {
      tool,
      workers: clampWorkers(workers),
      untilStop: mode === "until-stop",
      maxIterations: mode === "limited" ? maxIterations : undefined,
    };
    await onStart(input);
    setSettingsOpen(false);
  };

  const settingsForm = (
    <div className="loop-run-control__form">
      <div className="loop-run-control__field">
        <Text type="secondary" className="loop-run-control__label">
          工具
        </Text>
        <Select
          size="small"
          value={tool}
          onChange={setTool}
          options={LOOP_RUN_TOOLS.map((t) => ({ value: t, label: t }))}
          className="loop-run-control__select"
        />
      </div>
      <div className="loop-run-control__field">
        <Text type="secondary" className="loop-run-control__label">
          Workers
        </Text>
        <InputNumber
          size="small"
          min={1}
          max={8}
          value={workers}
          onChange={(v) => setWorkers(clampWorkers(v ?? 1))}
          className="loop-run-control__workers"
        />
      </div>
      <div className="loop-run-control__field">
        <Text type="secondary" className="loop-run-control__label">
          模式
        </Text>
        <Radio.Group
          size="small"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          className="loop-run-control__mode"
        >
          <Radio.Button value="until-stop">持续运行</Radio.Button>
          <Radio.Button value="limited">有限轮</Radio.Button>
        </Radio.Group>
      </div>
      {mode === "limited" && (
        <div className="loop-run-control__field">
          <Text type="secondary" className="loop-run-control__label">
            最大轮数
          </Text>
          <InputNumber
            size="small"
            min={1}
            max={999}
            value={maxIterations}
            onChange={(v) => setMaxIterations(Math.max(1, v ?? 10))}
          />
        </div>
      )}
      <Button
        type="primary"
        size="small"
        block
        loading={busy}
        onClick={() => void handleStart()}
        className="loop-run-control__start-btn"
      >
        启动外循环
      </Button>
    </div>
  );

  return (
    <div className="loop-run-control">
      <div className="loop-run-control__info">
        <Text strong className="loop-run-control__title">
          外循环
        </Text>
        {view.running ? (
          <Text type="secondary" className="loop-run-control__status">
            {view.tool}
            {view.workers > 1 && <> · {view.workers} workers</>}
            {view.iteration != null && <> · 第 {view.iteration} 轮</>}
            {view.stopRequested && <> · 停止中…</>}
          </Text>
        ) : (
          <Text type="secondary" className="loop-run-control__status">
            未运行
          </Text>
        )}
      </div>
      <Space size="small" className="loop-run-control__actions">
        {view.running ? (
          <Button
            danger
            size="small"
            loading={busy}
            disabled={view.stopRequested}
            onClick={() => void onStop()}
          >
            停止
          </Button>
        ) : (
          <Popover
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            trigger="click"
            placement="topRight"
            content={settingsForm}
            title="启动外循环"
          >
            <Button type="primary" size="small" loading={busy}>
              启动
            </Button>
          </Popover>
        )}
      </Space>
    </div>
  );
}

export { buildStartLoopRunPayload, resolveLoopRunControlView };
