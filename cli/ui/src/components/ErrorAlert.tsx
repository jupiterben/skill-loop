import type { ReactNode } from "react";
import { Alert, type AlertProps } from "antd";

type Props = Omit<AlertProps, "type"> & {
  error?: string | null;
};

export function ErrorAlert({ error, title, description, ...rest }: Props) {
  const alertTitle = title ?? error;
  if (!alertTitle) return null;

  const alertDescription =
    description ?? (title && error && title !== error ? error : undefined);

  return (
    <Alert
      type="error"
      showIcon
      title={alertTitle}
      description={alertDescription}
      {...rest}
    />
  );
}

export function AppErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <Alert.ErrorBoundary
      title="页面渲染异常"
      description="请刷新页面重试；若持续出现，请检查控制台日志。"
    >
      {children}
    </Alert.ErrorBoundary>
  );
}
