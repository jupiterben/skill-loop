import { useCallback, useState } from "react";
import { Spin } from "antd";
import { AppToolbar } from "./components/AppToolbar";
import { ProjectCard } from "./components/ProjectCard";
import { MindMapPanel } from "./components/MindMapPanel";
import { AgentLivePanel } from "./components/AgentLivePanel";
import { PatternsPanel } from "./components/PatternsPanel";
import { ProjectSpecPanel } from "./features/project-spec/ProjectSpecPanel";
import { ProgressPanel } from "./components/ProgressPanel";
import { RunsPanel } from "./components/RunsPanel";
import { CollapsiblePanel } from "./components/CollapsiblePanel";
import { ErrorAlert } from "./components/ErrorAlert";
import { useDashboard } from "./hooks/useDashboard";
import { api } from "./lib/api";

export function App() {
  const { data, error, refresh } = useDashboard();
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [patternsBusy, setPatternsBusy] = useState(false);
  const [specBusy, setSpecBusy] = useState(false);

  const handleConfirmStory = useCallback(
    async (storyId: string) => {
      setConfirmBusy(true);
      try {
        await api.confirmStory(storyId);
        await refresh();
      } finally {
        setConfirmBusy(false);
      }
    },
    [refresh]
  );

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
        <Spin size="large" description="加载 Loop Dashboard…" />
      </div>
    );
  }

  const { status, tree, features, userStories, archivedStories, milestones, dependencies, patterns, projectSpec, projectSpecTemplates, progress, runs } = data;
  const draftStories = userStories.filter(
    (s) => !s.passes && s.status === "draft"
  );
  const pct = status.totalStories
    ? Math.round((status.completedStories / status.totalStories) * 100)
    : 0;
  const loopRunning =
    status.activeRun?.status === "running" ||
    (status.activeRuns?.length ?? 0) > 0 ||
    data.loopRunner?.running === true;
  const runningStoryIds = new Set(
    [
      status.currentStory?.id,
      ...(status.activeRuns?.map((r) => r.storyId) ?? []),
      ...(data.loopRunner?.workers?.map((w) => w.currentStoryId) ?? []),
      data.loopRunner?.state?.currentStoryId,
    ].filter(Boolean) as string[]
  );

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
      <div className="app-body">
        <aside className="app-sidebar">
          <ProjectCard
            status={status}
            draftStories={draftStories}
            userStories={userStories}
            onConfirmStory={handleConfirmStory}
            busy={confirmBusy}
            loopRunner={data.loopRunner}
          />
          <ProgressPanel progress={progress} />
          <PatternsPanel
            patterns={patterns}
            busy={patternsBusy}
            onAdd={handleAddPattern}
            onUpdate={handleUpdatePattern}
            onDelete={handleDeletePattern}
          />
          <ProjectSpecPanel
            projectSpec={projectSpec}
            templates={projectSpecTemplates}
            busy={specBusy}
            onSave={handleSaveProjectSpec}
            onApplyTemplate={handleApplyProjectSpecTemplate}
          />
          <RunsPanel runs={runs} />
        </aside>

        <div className="app-workspace">
          <CollapsiblePanel
            storageKey="loop-mindmap-panel-open"
            defaultOpen
            title="脑图编辑"
            variant="workspace"
            className="workspace-panel--mindmap"
            bodyClassName="workspace-panel__body--fill"
          >
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
              runningStoryId={
                runningStoryIds.size === 1
                  ? [...runningStoryIds][0]!
                  : status.currentStory?.id ??
                    status.activeRun?.storyId ??
                    data.loopRunner?.state?.currentStoryId ??
                    null
              }
              runningStoryIds={[...runningStoryIds]}
            />
          </CollapsiblePanel>

          <CollapsiblePanel
            storageKey="loop-agent-panel-open"
            defaultOpen={loopRunning}
            title="Agent 输出"
            variant="workspace"
            className="workspace-panel--agent"
            bodyClassName="workspace-panel__body--agent"
          >
            <AgentLivePanel
              runLive={data.runLive}
              runLiveWorkers={data.runLiveWorkers}
              isRunning={loopRunning}
            />
          </CollapsiblePanel>
        </div>
      </div>
    </div>
  );
}
