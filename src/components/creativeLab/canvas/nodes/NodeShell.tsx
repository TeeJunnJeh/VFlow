import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { useLanguage } from '../../../../context/LanguageContext';
import type { NodeStatus } from '../canvasTypes';

const STATUS_COLORS: Record<NodeStatus, string> = {
  idle: 'bg-zinc-600',
  running: 'bg-yellow-500 animate-pulse',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
};

interface NodeShellProps {
  icon: React.ReactNode;
  title: string;
  status: NodeStatus;
  color: string; // e.g. 'orange', 'blue', 'purple'
  selected?: boolean;
  hasSource?: boolean;
  hasTarget?: boolean;
  error?: string;
  children: React.ReactNode;
}

export const NodeShell: React.FC<NodeShellProps> = ({
  icon,
  title,
  status,
  color,
  selected = false,
  hasSource = true,
  hasTarget = true,
  error,
  children,
}) => {
  const { t } = useLanguage();
  const STATUS_LABELS: Record<NodeStatus, string> = {
    idle: '',
    running: t.canvas_status_running,
    completed: t.canvas_status_done,
    failed: t.canvas_status_failed,
  };

  const borderColor = selected
    ? 'border-orange-400/70'
    : status === 'failed'
      ? 'border-red-500/50'
      : `border-${color}-500/30`;

  const selectedGlow = selected
    ? 'shadow-[0_0_16px_rgba(249,115,22,0.3)]'
    : 'shadow-lg shadow-black/30';

  return (
    <div
      className={`bg-zinc-900 border ${borderColor} rounded-xl ${selectedGlow} min-w-[260px] max-w-[320px] overflow-hidden transition-shadow duration-200`}
    >
      {hasTarget && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !bg-zinc-500 !border-2 !border-zinc-700 hover:!bg-zinc-300"
        />
      )}

      {/* Header */}
      <div className={`flex items-center gap-2 px-3 py-2 bg-${color}-500/10 border-b border-white/5`}>
        <span className={`text-${color}-400`}>{icon}</span>
        <span className="text-sm font-medium text-zinc-200 flex-1 truncate">{title}</span>
        {status !== 'idle' && (
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[status]}`} />
            <span className="text-[10px] text-zinc-400">{STATUS_LABELS[status]}</span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-3">{children}</div>

      {/* Error */}
      {error && (
        <div className="px-3 pb-2">
          <p className="text-[11px] text-red-400 truncate">{error}</p>
        </div>
      )}

      {hasSource && (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !bg-zinc-500 !border-2 !border-zinc-700 hover:!bg-zinc-300"
        />
      )}
    </div>
  );
};
