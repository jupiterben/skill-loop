import { List, Typography } from "antd";

const { Text } = Typography;

interface Props {
  patterns?: string[];
}

export function Patterns({ patterns = [] }: Props) {
  if (!patterns.length) {
    return <Text type="secondary">暂无模式记录</Text>;
  }
  return (
    <List
      className="pattern-list"
      size="small"
      dataSource={patterns}
      renderItem={(p, i) => <List.Item key={i}>{p}</List.Item>}
    />
  );
}
