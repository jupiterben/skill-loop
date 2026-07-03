import { useEffect } from "react";
import { useReactFlow } from "@xyflow/react";

/** 仅在项目或 Milestone 筛选切换时 fitView；节点重排/增删/收起展开不触发 */
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
