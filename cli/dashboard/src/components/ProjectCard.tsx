import { Button, Card, Descriptions, Progress, Tag, Typography } from "antd";
import type { ProjectStatus, UserStory } from "../types";

const { Paragraph, Text } = Typography;

interface Props {
  status: ProjectStatus;
  draftStories?: UserStory[];
  onConfirmStory?: (storyId: string) => void;
  busy?: boolean;
}

export function ProjectCard({
  status,
  draftStories = [],
  onConfirmStory,
  busy,
}: Props) {
  const total = status.totalStories ?? 0;
  const completed = status.completedStories ?? 0;
  const pending = status.pendingStories ?? 0;
  const featureCount = status.totalFeatures ?? 0;
  const pct = total ? Math.round((completed / total) * 100) : 0;
  const next = status.nextStory;
  const isRunning =
    status.activeRun?.status === "running" ||
    (status.activeRuns?.length ?? 0) > 0;

  return (
    <Card className="card project-card" size="small" title={status.project}>
      <Paragraph type="secondary" className="project-desc">
        {status.description || "—"}
      </Paragraph>
      <Descriptions
        className="project-meta"
        column={1}
        size="small"
        items={[
          { key: "branch", label: "分支", children: status.branchName },
          {
            key: "stories",
            label: "Stories",
            children: (
              <>
                待做 <Text strong>{pending}</Text> / 共 <Text strong>{total}</Text>
                {status.blockedStories > 0 && (
                  <>
                    {" "}
                    （<Text strong>{status.blockedStories}</Text> 被依赖阻塞）
                  </>
                )}
                {(status.draftStories ?? 0) > 0 && (
                  <>
                    {" "}
                    （<Text strong>{status.draftStories}</Text> 草稿待确认）
                  </>
                )}
              </>
            ),
          },
          ...(featureCount > 0
            ? [
                {
                  key: "features",
                  label: "Feature",
                  children: featureCount,
                },
              ]
            : []),
        ]}
      />
      <Progress
        className="project-progress"
        percent={pct}
        size="small"
        format={() => `${completed} / ${total} (${pct}%)`}
      />
      {draftStories.length > 0 && (
        <div className="project-drafts">
          <Text type="secondary" className="project-drafts__label">
            草稿待确认
          </Text>
          <ul className="project-drafts__list">
            {draftStories.map((story) => (
              <li key={story.id} className="project-drafts__item">
                <span className="project-drafts__text">
                  <code>{story.id}</code> {story.title}
                </span>
                {onConfirmStory && (
                  <Button
                    type="primary"
                    size="small"
                    disabled={busy}
                    onClick={() => onConfirmStory(story.id)}
                  >
                    确认可执行
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!isRunning && next ? (
        <div className="next-story">
          下一任务：<Text strong>{next.id}</Text> {next.title}
        </div>
      ) : !isRunning && status.isComplete ? (
        <Tag color="success" className="next-story next-story--done">
          全部完成
        </Tag>
      ) : !isRunning && draftStories.length > 0 ? (
        <Text type="secondary" className="next-story">
          确认草稿后才会进入执行队列
        </Text>
      ) : null}
    </Card>
  );
}
