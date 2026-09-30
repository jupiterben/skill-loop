import { App, ConfigProvider, theme } from "antd";
import type { ReactNode } from "react";

const antdTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: "#66d6bc",
    colorBgBase: "#141617",
    colorBgContainer: "#1c1e20",
    colorBgElevated: "#26282b",
    colorBorder: "#393c40",
    colorText: "#f0f1f2",
    colorTextSecondary: "#a2a8af",
    borderRadius: 6,
    fontFamily: '"Segoe UI", system-ui, -apple-system, sans-serif',
  },
  components: {
    Splitter: {
      splitBarSize: 3,
      splitTriggerSize: 12,
    },
  },
};

export function AntdProvider({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider
      theme={antdTheme}
      modal={{ centered: true }}
      getPopupContainer={() => document.body}
    >
      <App>{children}</App>
    </ConfigProvider>
  );
}
