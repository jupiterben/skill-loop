import { Collapse } from "antd";
import { useState, type ReactNode } from "react";

interface Props {
  storageKey: string;
  defaultOpen?: boolean;
  title: string;
  count: number;
  className?: string;
  children: ReactNode;
}

export function SidebarCollapse({
  storageKey,
  defaultOpen = true,
  title,
  count,
  className,
  children,
}: Props) {
  const [activeKey, setActiveKey] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored === "0") return [];
      if (stored === "1") return ["panel"];
      return defaultOpen ? ["panel"] : [];
    } catch {
      return defaultOpen ? ["panel"] : [];
    }
  });

  return (
    <Collapse
      className={`sidebar-accordion${className ? ` ${className}` : ""}`}
      activeKey={activeKey}
      onChange={(keys) => {
        const next = Array.isArray(keys) ? keys : keys ? [keys] : [];
        setActiveKey(next);
        try {
          localStorage.setItem(storageKey, next.includes("panel") ? "1" : "0");
        } catch {
          /* ignore */
        }
      }}
      items={[
        {
          key: "panel",
          label: (
            <span className="sidebar-accordion__label">
              <span className="sidebar-accordion__title">{title}</span>
              <span className="sidebar-accordion__count">{count}</span>
            </span>
          ),
          children: <div className="sidebar-accordion__body">{children}</div>,
        },
      ]}
    />
  );
}
