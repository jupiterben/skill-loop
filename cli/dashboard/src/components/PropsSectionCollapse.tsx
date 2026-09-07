import { Collapse } from "antd";
import { useMemo, useState, type ReactNode } from "react";

interface Props {
  storageKey: string;
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function PropsSectionCollapse({
  storageKey,
  title,
  defaultOpen = true,
  children,
}: Props) {
  const [activeKey, setActiveKey] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored === "0") return [];
      if (stored === "1") return ["section"];
      return defaultOpen ? ["section"] : [];
    } catch {
      return defaultOpen ? ["section"] : [];
    }
  });

  const items = useMemo(
    () => [
      {
        key: "section",
        label: <span className="props-section__title">{title}</span>,
        children: <div className="props-section__body">{children}</div>,
      },
    ],
    [title, children]
  );

  return (
    <Collapse
      className="props-section"
      bordered={false}
      activeKey={activeKey}
      onChange={(keys) => {
        const next = Array.isArray(keys) ? keys : keys ? [keys] : [];
        setActiveKey(next);
        try {
          localStorage.setItem(
            storageKey,
            next.includes("section") ? "1" : "0"
          );
        } catch {
          /* ignore */
        }
      }}
      items={items}
    />
  );
}
