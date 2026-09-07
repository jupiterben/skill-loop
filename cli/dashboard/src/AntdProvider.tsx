import { App, ConfigProvider, theme } from "antd";
import type { ReactNode } from "react";

const antdTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: "#5b9cf5",
    colorBgBase: "#090d12",
    colorBgContainer: "#121820",
    colorBgElevated: "#1a2330",
    colorBorder: "#283444",
    colorText: "#edf2f8",
    colorTextSecondary: "#8b9cb3",
    borderRadius: 10,
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
      tooltip={{ getPopupContainer: () => document.body }}
    >
      <App>{children}</App>
    </ConfigProvider>
  );
}
