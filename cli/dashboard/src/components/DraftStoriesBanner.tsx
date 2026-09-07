import { Button, Tag, Typography } from "antd";
import type { UserStory } from "../types";

const { Text } = Typography;

interface Props {
  stories: UserStory[];
  onConfirmStory?: (storyId: string) => void;
  busy?: boolean;
}

export function DraftStoriesBanner({
  stories,
  onConfirmStory,
  busy,
}: Props) {
  if (!stories.length) return null;

  return (
    <div className="draft-banner" role="region" aria-label="草稿待确认">
      <div className="draft-banner__head">
        <Tag color="warning" className="draft-banner__tag">
          草稿 {stories.length}
        </Tag>
        <Text type="secondary" className="draft-banner__hint">
          确认后才会进入执行队列
        </Text>
      </div>
      <ul className="draft-banner__list">
        {stories.map((story) => (
          <li key={story.id} className="draft-banner__item">
            <span className="draft-banner__text">
              <code>{story.id}</code>
              <span className="draft-banner__title">{story.title}</span>
            </span>
            {onConfirmStory && (
              <Button
                type="primary"
                size="small"
                disabled={busy}
                className="draft-banner__btn"
                onClick={() => onConfirmStory(story.id)}
              >
                确认可执行
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
