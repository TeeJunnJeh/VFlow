/**
 * VideoNode — slim "video slot" node. All generation configuration (prompt,
 * model, duration, aspect ratio) has moved to the global `BottomInputPanel`
 * that opens when the user clicks the node. The node body is purely a display
 * surface:
 *   - Empty state: dashed placeholder telling the user to click + configure
 *   - Filled state: video element with controls (or thumbnail before completion)
 *
 * Configuration fields on `VideoNodeData` (prompt / model / duration /
 * aspectRatio) are preserved so the panel can read + write them; the existing
 * `canvas:generate-inline` CustomEvent path on CanvasEditor still drives the
 * actual API call — the only difference is the chip / textarea UI lives in
 * BottomInputPanel instead of inline.
 */
import React from 'react';
import { type NodeProps } from '@xyflow/react';
import { Video } from 'lucide-react';
import { NodeShell } from './NodeShell';
import { RegenerateButton } from './RegenerateButton';
import { useLanguage } from '../../../../context/LanguageContext';
import type { VideoNodeData, CanvasNode } from '../canvasTypes';

export const VideoNode: React.FC<NodeProps<CanvasNode>> = ({ id, data: rawData, selected }) => {
  const data = rawData as VideoNodeData;
  const { t } = useLanguage();
  const tt = t as Record<string, string | undefined>;

  const hasOutput = Boolean(data.videoUrl) || Boolean(data.thumbnailUrl);

  return (
    <NodeShell
      icon={<Video className="w-4 h-4" />}
      title={t.canvas_node_video}
      status={data.status}
      color="purple"
      selected={selected}
      error={data.error}
      headerActions={<RegenerateButton nodeId={id} status={data.status} />}
    >
      <div className="min-w-[240px] max-w-[300px]">
        {data.videoUrl ? (
          <video
            src={data.videoUrl}
            controls
            className="w-full h-36 rounded-md border border-white/5 bg-black"
          />
        ) : data.thumbnailUrl ? (
          <img
            src={data.thumbnailUrl}
            alt="thumbnail"
            className="w-full h-36 object-cover rounded-md border border-white/5"
          />
        ) : (
          <div className="h-28 rounded-md border-2 border-dashed border-purple-500/30 bg-purple-500/5 flex items-center justify-center px-3 text-center">
            <div className="text-[11px] text-zinc-400 leading-snug">
              {tt.canvas_video_placeholder_hint
                || 'Click this node to set prompt + model + duration, then generate.'}
            </div>
          </div>
        )}

        {/* When prefilled from old snapshots, show a short summary so users
            know what the panel will preload before they click. */}
        {!hasOutput && data.prompt ? (
          <div className="mt-2 text-[10px] text-zinc-500 italic line-clamp-2">
            {data.prompt}
          </div>
        ) : null}
      </div>
    </NodeShell>
  );
};
