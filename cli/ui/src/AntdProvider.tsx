import { App, ConfigProvider, theme } from "antd";
import type { ReactNode } from "react";

const antdTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: "#5b9cf5",
    colorBgBase: "#0b0f14",
    colorBgContainer: "#141b24",
    colorBgElevated: "#1c2633",
    colorBorder: "#2a3544",
    colorText: "#e8edf4",
    colorTextSecondary: "#8b9cb3",
    borderRadius: 10,
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
