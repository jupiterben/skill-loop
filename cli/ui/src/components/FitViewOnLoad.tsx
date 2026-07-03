import { useEffect } from "react";
import { useReactFlow } from "@xyflow/react";

/** 仅在数据切换时 fitView，收起/展开不触发 */
export function FitViewOnLoad({ trigger }: { trigger: string }) {
  const { fitView } = useReactFlow();

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      void fitView({ padding: 0.2, duration: 0 });
    });
    return () => cancelAnimationFrame(id);
  }, [trigger, fitView]);

  return null;
}
