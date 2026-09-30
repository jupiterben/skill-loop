import { useState } from "react";
import {
  Alert,
  Button,
  InputNumber,
  Popover,
  Radio,
  Select,
  Space,
  Typography,
  Tooltip,
} from "antd";
import { SettingOutlined } from "@ant-design/icons";
import {
  type LoopRunStartInput,
  type LoopRunTool,
  buildStartLoopRunPayload,
  clampWorkers,
  resolveLoopRunControlView,
} from "./loopRunControlView";
import type { DashboardData } from "../../types";
import { emptyAgentConfig, type AgentConfig } from "../../../../domain/agent-config";
import { agentSelectionLabel, agentSelectionOptions } from "../agent-config/agentSelection";
import type { RunTool } from "../../../../domain/run-tool";

const { Text } = Typography;

interface Props {
  installedTools?: RunTool[];
  agentConfig?: AgentConfig;
  onManageAgents?: () => void;
  loopRunner?: DashboardData["loopRunner"];
  busy?: boolean;
  onStart: (input: LoopRunStartInput) => Promise<void>;
  onStop: () => Promise<void>;
}

export function LoopRunControl({ loopRunner, busy, onStart, onStop, agentConfig = emptyAgentConfig(), onManageAgents, installedTools = [] }: Props) {
  const view = resolveLoopRunControlView(loopRunner);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selection, setSelection] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [workers, setWorkers] = useState(1);
  const [mode, setMode] = useState<"until-stop" | "limited">("until-stop");
  const [maxIterations, setMaxIterations] = useState(10);

  const handleStart = async () => {
    const input: LoopRunStartInput = {
      ...(selection.startsWith("profile:") ? { agentProfileId: selection.slice(8) } :
        selection.startsWith("tool:") ? { tool: selection.slice(5) as LoopRunTool } : {}),
      workers: clampWorkers(workers),
      untilStop: mode === "until-stop",
      maxIterations: mode === "limited" ? maxIterations : undefined,
    };
    setError(null);
    try {
      await onStart(input);
      setSettingsOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const settingsForm = (
    <div className="loop-run-control__form">
      {error && <Alert type="error" title={error} showIcon />}
      <div className="loop-run-control__field">
        <Text type="secondary" className="loop-run-control__label">
          执行 Agent
        </Text>
        <Select
          size="small"
          aria-label="执行 Agent"
          labelInValue
          value={{ value: selection, label: agentSelectionLabel(selection, agentConfig, installedTools) }}
          onChange={({ value }) => setSelection(value)}
          options={agentSelectionOptions(agentConfig, installedTools)}
          optionFilterProp="label"
          showSearch
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
            {view.agentProfileName ?? view.tool}
            {view.model && <> · {view.model}</>}
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
        {onManageAgents && <Tooltip title="Agent 配置">
          <Button type="text" icon={<SettingOutlined />} aria-label="Agent 配置"
            onClick={() => { setSettingsOpen(false); onManageAgents(); }} />
        </Tooltip>}
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
