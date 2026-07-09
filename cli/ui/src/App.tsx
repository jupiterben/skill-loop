import { useCallback, useState } from "react";
import { Splitter, Spin } from "antd";
import { useSplitSizes } from "./hooks/useSplitSizes";
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
import { useDashboard } from "./hooks/useDashboard";
import { api } from "./lib/api";
import { isLoopProcessRunning, resolveRunningStoryIds } from "./lib/runningStories";

export function App() {
  const { data, error, refresh } = useDashboard();
  const [patternsBusy, setPatternsBusy] = useState(false);
  const [specBusy, setSpecBusy] = useState(false);
  const [metaBusy, setMetaBusy] = useState(false);
  const { sizes: bodySizes, onResizeEnd: onBodySplitEnd } = useSplitSizes(
    "loop-body-split-v2",
    [280, 720, 300]
  );
  const { sizes: workspaceSizes, onResizeEnd: onWorkspaceSplitEnd } =
    useSplitSizes("loop-workspace-split", [72, 28]);

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

  return (
    <div className="app-shell">
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
      <Splitter
        className="app-body-splitter"
        onResizeEnd={onBodySplitEnd}
      >
        <Splitter.Panel
          defaultSize={bodySizes[0] || 280}
          min={220}
          max={420}
          collapsible
          className="app-body-splitter__sidebar app-body-splitter__sidebar--left"
        >
          <aside className="app-sidebar app-sidebar--left">
            <ProjectMetaPanel
              status={status}
              busy={metaBusy}
              onSave={handleSaveProjectMeta}
            />
            <ProjectSpecPanel
              projectSpec={projectSpec}
              templates={projectSpecTemplates}
              busy={specBusy}
              onSave={handleSaveProjectSpec}
              onApplyTemplate={handleApplyProjectSpecTemplate}
            />
            <PatternsPanel
              patterns={patterns}
              busy={patternsBusy}
              onAdd={handleAddPattern}
              onUpdate={handleUpdatePattern}
              onDelete={handleDeletePattern}
            />
          </aside>
        </Splitter.Panel>

        <Splitter.Panel min={360} className="app-body-splitter__workspace">
          <div className="app-workspace">
            <Splitter
              className="app-workspace-splitter"
              orientation="vertical"
              onResizeEnd={onWorkspaceSplitEnd}
            >
              <Splitter.Panel
                defaultSize={workspaceSizes[0] || "72%"}
                min={240}
              >
                <div className="app-workspace__main">
                  <MindMapPanel
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
                  />
                </div>
              </Splitter.Panel>

              <Splitter.Panel
                defaultSize={workspaceSizes[1] || "28%"}
                min={120}
              >
                <div className="app-workspace__agent">
                  <AgentLivePanel
                    runLive={data.runLive}
                    runLiveWorkers={data.runLiveWorkers}
                    isRunning={loopRunning}
                  />
                  <RunsPanel runs={runs} />
                </div>
              </Splitter.Panel>
            </Splitter>

            <WorkspaceStatusBar
              status={status}
              userStories={userStories}
              loopRunner={data.loopRunner}
            />
          </div>
        </Splitter.Panel>

        <Splitter.Panel
          defaultSize={bodySizes[2] || 300}
          min={220}
          max={480}
          collapsible={{ start: true }}
          className="app-body-splitter__sidebar app-body-splitter__sidebar--right"
        >
          <aside className="app-sidebar app-sidebar--right">
            <ProgressPanel progress={progress} standalone />
          </aside>
        </Splitter.Panel>
      </Splitter>
    </div>
  );
}
