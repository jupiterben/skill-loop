import { useCallback, useState } from "react";
import { Spin } from "antd";
import { ProjectCard } from "./components/ProjectCard";
import { MindMapPanel } from "./components/MindMapPanel";
import { AgentLivePanel } from "./components/AgentLivePanel";
import { PatternsPanel } from "./components/PatternsPanel";
import { RunsPanel } from "./components/RunsPanel";
import { ErrorAlert } from "./components/ErrorAlert";
import { useDashboard } from "./hooks/useDashboard";
import { api } from "./lib/api";

export function App() {
  const { data, error, refresh } = useDashboard();
  const [confirmBusy, setConfirmBusy] = useState(false);

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

  if (error && !data) {
    return (
      <div className="layout">
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
      <div className="layout layout--loading">
        <Spin size="large" description="加载中…" />
      </div>
    );
  }

  const { status, tree, features, userStories, archivedStories, milestones, dependencies, patterns, progress, runs } = data;
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
    <div className="layout layout--mindmap">
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
      <aside className="sidebar">
        <ProjectCard
          status={status}
          draftStories={draftStories}
          userStories={userStories}
          onConfirmStory={handleConfirmStory}
          busy={confirmBusy}
          loopRunner={data.loopRunner}
        />
        <PatternsPanel patterns={patterns} />
        <RunsPanel runs={runs} />
      </aside>

      <main className="main">
        <section className="card card--mindmap">
          <h2>脑图编辑</h2>
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
        </section>
        <AgentLivePanel
          runLive={data.runLive}
          runLiveWorkers={data.runLiveWorkers}
          isRunning={loopRunning}
        />
      </main>
    </div>
  );
}
