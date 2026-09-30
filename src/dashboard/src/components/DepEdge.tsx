import { memo } from "react";
import { BaseEdge, getSmoothStepPath, type EdgeProps } from "@xyflow/react";

import { depEdgeStrokeColor } from "../lib/mindmapLayout";

function DepEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  markerEnd,
}: EdgeProps) {
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 16,
    offset: 28,
  });

  const color = depEdgeStrokeColor(Boolean(selected));

  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={markerEnd}
      interactionWidth={18}
      style={{
        stroke: color,
        strokeWidth: selected ? 3 : 2.5,
      }}
    />
  );
}

export default memo(DepEdge);
