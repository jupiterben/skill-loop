import { type ReactNode } from "react";
import { CollapsiblePanel } from "./CollapsiblePanel";

interface Props {
  storageKey: string;
  defaultOpen?: boolean;
  title: string;
  count: number;
  className?: string;
  children: ReactNode;
}

/** @deprecated Prefer CollapsiblePanel directly */
export function SidebarCollapse(props: Props) {
  return <CollapsiblePanel variant="sidebar" {...props} />;
}
