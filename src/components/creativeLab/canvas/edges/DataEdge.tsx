import React from 'react';
import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import type { CanvasEdge } from '../canvasTypes';

const TYPE_COLORS: Record<string, string> = {
  text: '#f97316',   // orange
  image: '#3b82f6',  // blue
  video: '#a855f7',  // purple
};

export const DataEdge: React.FC<EdgeProps<CanvasEdge>> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}) => {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 12,
  });

  const color = TYPE_COLORS[data?.dataType || 'text'] || '#71717a';

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: color,
          strokeWidth: selected ? 2.5 : 1.5,
          opacity: selected ? 1 : 0.6,
        }}
      />
      {/* Animated dot along edge */}
      <circle r="3" fill={color}>
        <animateMotion dur="2s" repeatCount="indefinite" path={edgePath} />
      </circle>
    </>
  );
};
