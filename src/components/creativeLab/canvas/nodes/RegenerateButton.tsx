/**
 * Small "regenerate" affordance shown in the NodeShell header of generative nodes
 * (Video / Image / Script). Click dispatches a `canvas:regenerate` CustomEvent that
 * CanvasEditor listens for and routes to the appropriate regen handler.
 *
 * Using a DOM event keeps the node decoupled from CanvasEditor; nodes are mounted
 * by @xyflow/react via `nodeTypes` and cannot directly receive parent callbacks.
 */
import React from 'react';
import { RotateCw } from 'lucide-react';
import type { NodeStatus } from '../canvasTypes';

interface RegenerateButtonProps {
  nodeId: string;
  status: NodeStatus;
}

export const RegenerateButton: React.FC<RegenerateButtonProps> = ({ nodeId, status }) => {
  // Only show when there's a previous result worth regenerating from
  if (status !== 'completed' && status !== 'failed') return null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('canvas:regenerate', { detail: { nodeId } }));
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title="Regenerate"
      className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-zinc-200 transition-colors"
    >
      <RotateCw className="w-3.5 h-3.5" />
    </button>
  );
};
