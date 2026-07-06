import { Collapse } from "antd";
import { useState, type ReactNode } from "react";

interface Props {
  storageKey: string;
  defaultOpen?: boolean;
  title: string;
  count?: number;
  extra?: ReactNode;
  className?: string;
  variant?: "sidebar" | "workspace";
  bodyClassName?: string;
  children: ReactNode;
}

export function CollapsiblePanel({
  storageKey,
  defaultOpen = true,
  title,
  count,
  extra,
  className,
  variant = "sidebar",
  bodyClassName,
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

  const isOpen = activeKey.includes("panel");
  const rootClass =
    variant === "workspace"
      ? `workspace-panel${isOpen ? " workspace-panel--open" : " workspace-panel--collapsed"}${className ? ` ${className}` : ""}`
      : `sidebar-accordion${className ? ` ${className}` : ""}`;

  return (
    <Collapse
      className={rootClass}
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
            <span className="panel-accordion__label">
              <span className="panel-accordion__title">{title}</span>
              {count != null && (
                <span className="panel-accordion__count">{count}</span>
              )}
              {extra}
            </span>
          ),
          children: (
            <div
              className={`panel-accordion__body${bodyClassName ? ` ${bodyClassName}` : ""}`}
            >
              {children}
            </div>
          ),
        },
      ]}
    />
  );
}
