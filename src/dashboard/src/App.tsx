import { useCallback, useState } from "react";
import { Button, Spin, Tabs, Tooltip } from "antd";
import { ApartmentOutlined, BookOutlined, HistoryOutlined, ReloadOutlined, RobotOutlined } from "@ant-design/icons";
import { AgentConfigPanel } from "./features/agent-config/AgentConfigPanel";
import { emptyAgentConfig } from "../../domain/agent-config";
import { AppToolbar } from "./components/AppToolbar";
import { MindMapPanel } from "./components/MindMapPanel";
import { AgentLivePanel } from "./components/AgentLivePanel";
import { PatternsPanel } from "./features/patterns/PatternsPanel";
import { ProjectSpecPanel } from "./features/project-spec/ProjectSpecPanel";
import { ProjectMetaPanel } from "./features/project-meta/ProjectMetaPanel";
import { ProgressPanel } from "./components/ProgressPanel";
import { RunsPanel } from "./components/RunsPanel";
import { WorkspaceStatusBar } from "./components/WorkspaceStatusBar";
import { ErrorAlert } from "./components/ErrorAlert";
import { LoopRunControl } from "./features/loop-run-control/LoopRunControl";
import { buildStartLoopRunPayload } from "./features/loop-run-control/loopRunControlView";
import type { LoopRunStartInput } from "./features/loop-run-control/loopRunControlView";
import { useDashboard } from "./hooks/useDashboard";
import { api } from "./lib/api";
import { isLoopProcessRunning, resolveRunningStoryIds } from "./lib/runningStories";
import { RequirementComposer } from "./features/requirement-composer/RequirementComposer";
import type { SelectedMindMapNode } from "./types";

export function App() {
  const { data, error, refresh } = useDashboard();
  const [patternsBusy, setPatternsBusy] = useState(false);
  const [specBusy, setSpecBusy] = useState(false);
  const [metaBusy, setMetaBusy] = useState(false);
  const [loopBusy, setLoopBusy] = useState(false);
  const [activeView, setActiveView] = useState("map");
  const [focusNode, setFocusNode] = useState<SelectedMindMapNode | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const handleLocate = useCallback((node: SelectedMindMapNode) => {
    setFocusNode(node);
    setActiveView("map");
  }, []);

  const handleAddPattern = useCallback(
    async (content: string) => {
      setPatternsBusy(true);
      try {
        await api.addPattern(content);
        await refresh();
      } finally {
        setPatternsBusy(false);
      }
    },
    [refresh]
  );

  const handleUpdatePattern = useCallback(
    async (index: number, content: string) => {
      setPatternsBusy(true);
      try {
        await api.updatePattern(index, content);
        await refresh();
      } finally {
        setPatternsBusy(false);
      }
    },
    [refresh]
  );

  const handleDeletePattern = useCallback(
    async (index: number) => {
      setPatternsBusy(true);
      try {
        await api.deletePattern(index);
        await refresh();
      } finally {
        setPatternsBusy(false);
      }
    },
    [refresh]
  );

  const handleSaveProjectSpec = useCallback(
    async (content: string) => {
      setSpecBusy(true);
      try {
        await api.updateProjectSpec(content);
        await refresh();
      } finally {
        setSpecBusy(false);
      }
    },
    [refresh]
  );

  const handleApplyProjectSpecTemplate = useCallback(
    async (templateId: string, append: boolean) => {
      setSpecBusy(true);
      try {
        await api.applyProjectSpecTemplate(templateId, append);
        await refresh();
      } finally {
        setSpecBusy(false);
      }
    },
    [refresh]
  );

  const handleStartLoopRun = useCallback(
    async (input: LoopRunStartInput) => {
      setLoopBusy(true);
      try {
        await api.startLoopRun(buildStartLoopRunPayload(input));
        await refresh();
      } finally {
        setLoopBusy(false);
      }
    },
    [refresh]
  );

  const handleStopLoopRun = useCallback(async () => {
    setLoopBusy(true);
    try {
      await api.stopLoopRun();
      await refresh();
    } finally {
      setLoopBusy(false);
    }
  }, [refresh]);

  const handleSaveProjectMeta = useCallback(
    async (draft: {
      branchName: string;
      description: string;
      vision: string;
    }) => {
      setMetaBusy(true);
      try {
        await api.updateProject({
          branchName: draft.branchName,
          description: draft.description,
          vision: draft.vision,
        });
        await refresh();
      } finally {
        setMetaBusy(false);
      }
    },
    [refresh]
  );

  if (error && !data) {
    return (
      <div className="app-shell app-shell--centered">
        <ErrorAlert
          title="无法加载仪表盘"
          description={
            <>
              <div>{error}</div>
              <div>请确认已设置 LOOP_PROJECT_ROOT，并执行 loop init --project &lt;名称&gt;</div>
            </>
          }
        />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="app-shell app-shell--centered">
        <div className="app-loading">
          <Spin size="large" />
          <p className="app-loading__text">加载 Loop Dashboard…</p>
        </div>
      </div>
    );
  }

  const { status, tree, features, userStories, archivedStories, milestones, dependencies, patterns, projectSpec, projectSpecTemplates, progress, runs } = data;
  const pct = status.totalStories
    ? Math.round((status.completedStories / status.totalStories) * 100)
    : 0;
  const loopRunning = isLoopProcessRunning(data);
  const runningStoryIds = resolveRunningStoryIds(data);
  const agentConfig = data.agentConfig ?? emptyAgentConfig();

  return (
    <div className="app-shell app-shell--workspace">
      <AppToolbar status={status} />
      {error && (
        <ErrorAlert
          className="app-error-banner"
          banner
          closable
          title="数据刷新失败"
          description={
            <>
              <div>{error}</div>
              <div>将暂时显示上次成功加载的数据</div>
            </>
          }
        />
      )}
      <div className="dashboard-workspace">
        <RequirementComposer
          key={data.projectRoot ?? data.projectName}
          projectKey={data.projectRoot ?? data.projectName}
          features={features}
          milestones={milestones}
          onRefresh={refresh}
          onLocate={handleLocate}
        />
        <main className="dashboard-workspace__main" aria-label="项目工作区">
          <div className="dashboard-workspace__controls">
            <span className="dashboard-workspace__context">
              <span className={loopRunning ? "workspace-indicator is-running" : "workspace-indicator"} />
              {loopRunning ? "Agent 执行中" : "工作区"}
              <span className="dashboard-workspace__count">{features.length} Feature · {userStories.length} Story</span>
            </span>
            <div className="dashboard-workspace__actions">
              <Tooltip title="刷新项目数据">
                <Button
                  aria-label="刷新项目数据" type="text" icon={<ReloadOutlined />}
                  loading={refreshing}
                  onClick={async () => {
                    setRefreshing(true);
                    try { await refresh(); } finally { setRefreshing(false); }
                  }}
                />
              </Tooltip>
              <LoopRunControl
                installedTools={data.installedAgentTools}
                agentConfig={agentConfig}
                onManageAgents={() => setActiveView("agents")}
                loopRunner={data.loopRunner}
                busy={loopBusy}
                onStart={handleStartLoopRun}
                onStop={handleStopLoopRun}
              />
            </div>
          </div>
          <Tabs
            className="dashboard-workspace__tabs"
            activeKey={activeView}
            onChange={setActiveView}
            items={[
              {
                key: "map",
                label: "需求地图",
                icon: <ApartmentOutlined />,
                forceRender: true,
                children: <div className="app-workspace__main">
                  <MindMapPanel
                    installedTools={data.installedAgentTools}
                    agentConfig={agentConfig}
                    projectTitle={status.project}
                    progressPct={pct}
                    tree={tree}
                    features={features}
                    userStories={userStories}
                    archivedStories={archivedStories}
                    milestones={milestones}
                    dependencies={dependencies}
                    progress={progress}
                    onRefresh={refresh}
                    runningStoryIds={[...runningStoryIds]}
                    focusNode={focusNode}
                  />
                </div>,
              },
              {
                key: "activity",
                label: "执行记录",
                icon: <HistoryOutlined />,
                forceRender: true,
                children: <div className="dashboard-activity">
                  <div className="dashboard-activity__live">
                    <AgentLivePanel
                      runLive={data.runLive}
                      runLiveWorkers={data.runLiveWorkers}
                      isRunning={loopRunning}
                    />
                    <RunsPanel runs={runs} />
                  </div>
                  <ProgressPanel progress={progress} standalone />
                </div>,
              },
              {
                key: "agents",
                label: "Agent 配置",
                icon: <RobotOutlined />,
                children: <AgentConfigPanel config={agentConfig} onRefresh={refresh} installedTools={data.installedAgentTools} />,
              },
              {
                key: "project",
                label: "项目资料",
                icon: <BookOutlined />,
                forceRender: true,
                children: <div className="dashboard-project">
                  <div className="dashboard-project__settings">
                    <ProjectMetaPanel status={status} busy={metaBusy} onSave={handleSaveProjectMeta} />
                    <ProjectSpecPanel
                      projectSpec={projectSpec} templates={projectSpecTemplates}
                      busy={specBusy} onSave={handleSaveProjectSpec}
                      onApplyTemplate={handleApplyProjectSpecTemplate}
                    />
                  </div>
                  <PatternsPanel
                    patterns={patterns} busy={patternsBusy}
                    onAdd={handleAddPattern} onUpdate={handleUpdatePattern}
                    onDelete={handleDeletePattern}
                  />
                </div>,
              },
            ]}
          />
          <WorkspaceStatusBar
            status={status}
            userStories={userStories}
            loopRunner={data.loopRunner}
          />
        </main>
      </div>
    </div>
  );
}
