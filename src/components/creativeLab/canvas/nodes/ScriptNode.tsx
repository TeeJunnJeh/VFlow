import React from 'react';
import { type NodeProps } from '@xyflow/react';
import { ScrollText, Loader2 } from 'lucide-react';
import { NodeShell } from './NodeShell';
import { useLanguage } from '../../../../context/LanguageContext';
import type { ScriptNodeData, CanvasNode } from '../canvasTypes';

export const ScriptNode: React.FC<NodeProps<CanvasNode>> = ({ data: rawData, selected }) => {
  const data = rawData as ScriptNodeData;
  const { t } = useLanguage();

  const isRunning = data.status === 'running';
  const hasShots = data.shots && data.shots.length > 0;

  return (
    <NodeShell
      icon={<ScrollText className="w-4 h-4" />}
      title={t.canvas_node_script || 'Script'}
      status={data.status}
      color="orange"
      selected={selected}
      error={data.error}
    >
      <div className="min-w-[280px] max-w-[380px]">
        {/* Loading state */}
        {isRunning && (
          <div className="flex items-center justify-center gap-2 py-4">
            <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
            <span className="text-xs text-zinc-400">{t.canvas_script_generating || 'Generating script...'}</span>
          </div>
        )}

        {/* Empty state */}
        {!isRunning && !hasShots && data.status !== 'failed' && (
          <div className="py-3 text-center">
            <span className="text-[11px] text-zinc-500">{t.canvas_script_empty || 'No shots generated'}</span>
          </div>
        )}

        {/* Shot list */}
        {hasShots && (
          <div className="space-y-1.5 max-h-[240px] overflow-y-auto custom-scroll nowheel">
            {data.shots.map((shot, idx) => (
              <div
                key={shot.shot_index ?? idx}
                className="flex gap-2 p-1.5 rounded-md bg-zinc-800/60 border border-white/5"
              >
                {/* Shot index */}
                <div className="flex-shrink-0 w-5 h-5 rounded bg-orange-500/20 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-orange-400">{shot.shot_index ?? idx + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  {/* Type + Duration */}
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[9px] px-1 py-0.5 rounded bg-zinc-700 text-zinc-300">{shot.type}</span>
                    <span className="text-[9px] text-zinc-500">{shot.duration_sec}s</span>
                  </div>
                  {/* Visual */}
                  <p className="text-[10px] text-zinc-300 line-clamp-2 leading-relaxed">{shot.visual}</p>
                  {/* Audio */}
                  {shot.audio && (
                    <p className="text-[10px] text-zinc-500 line-clamp-1 mt-0.5">
                      <span className="text-zinc-600">{t.canvas_script_audio || 'Audio'}:</span> {shot.audio}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Metadata */}
        {hasShots && (
          <div className="flex items-center gap-2 mt-2 pt-1.5 border-t border-white/5">
            <span className="text-[10px] text-zinc-500">
              {data.shots.length} {t.canvas_script_shot || 'shots'}
            </span>
            <span className="text-[10px] text-zinc-600">•</span>
            <span className="text-[10px] text-zinc-500">
              {data.shots.reduce((sum, s) => sum + s.duration_sec, 0)}s
            </span>
          </div>
        )}
      </div>
    </NodeShell>
  );
};
