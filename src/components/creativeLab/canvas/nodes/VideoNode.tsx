import React, { useCallback } from 'react';
import { type NodeProps } from '@xyflow/react';
import { Video, Play, Loader2 } from 'lucide-react';
import { NodeShell } from './NodeShell';
import { RegenerateButton } from './RegenerateButton';
import { useCanvasStore } from '../canvasStore';
import { useLanguage } from '../../../../context/LanguageContext';
import type { VideoNodeData, CanvasNode } from '../canvasTypes';
import { CanvasModelChips, type CanvasModelChipOption } from '../panels/CanvasModelChips';
import { CostBadge } from './imageModes/CostBadge';

const MODEL_OPTIONS: CanvasModelChipOption[] = [
  { value: 'kling', label: 'Kling', color: 'purple' },
  { value: 'sora2', label: 'Sora 2', color: 'purple' },
  { value: 'sora2pro', label: 'Sora 2 Pro', color: 'purple' },
  { value: 'seedance2.0', label: 'Seedance', color: 'purple' },
];

const DURATION_OPTIONS = [5, 10, 15];
const RATIO_OPTIONS: VideoNodeData['aspectRatio'][] = ['9:16', '16:9', '1:1'];

interface VideoNodeActions {
  onGenerate?: (nodeId: string) => void;
}

export const VideoNode: React.FC<NodeProps<CanvasNode> & VideoNodeActions> = ({
  id,
  data: rawData,
  selected,
}) => {
  const data = rawData as VideoNodeData;
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const { t } = useLanguage();

  const onPromptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateNodeData(id, { prompt: e.target.value });
    },
    [id, updateNodeData]
  );

  const onModelChange = useCallback(
    (next: string) => {
      updateNodeData(id, { model: next });
    },
    [id, updateNodeData]
  );

  const onDurationChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateNodeData(id, { duration: Number(e.target.value) });
    },
    [id, updateNodeData]
  );

  const onRatioChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateNodeData(id, { aspectRatio: e.target.value as VideoNodeData['aspectRatio'] });
    },
    [id, updateNodeData]
  );

  const isRunning = data.status === 'running';

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
      {/* Video preview */}
      {data.videoUrl ? (
        <video
          src={data.videoUrl}
          controls
          className="w-full h-36 rounded-md border border-white/5 bg-black mb-2"
        />
      ) : data.thumbnailUrl ? (
        <img
          src={data.thumbnailUrl}
          alt="Thumbnail"
          className="w-full h-36 object-cover rounded-md border border-white/5 mb-2"
        />
      ) : null}

      {/* Prompt */}
      <textarea
        value={data.prompt}
        onChange={onPromptChange}
        placeholder={t.canvas_video_placeholder}
        rows={2}
        className="w-full px-2 py-1.5 text-xs bg-zinc-800 border border-white/10 rounded-md text-zinc-300 resize-none focus:outline-none focus:border-purple-500/50 mb-2"
      />

      {/* Model chip row */}
      <CanvasModelChips
        value={data.model}
        onChange={onModelChange}
        options={MODEL_OPTIONS}
        size="xs"
        className="mb-2"
      />

      {/* Duration + Ratio */}
      <div className="flex gap-1.5 mb-2">
        <select
          value={data.duration}
          onChange={onDurationChange}
          className="flex-1 px-1.5 py-1 text-[11px] bg-zinc-800 border border-white/10 rounded text-zinc-300 focus:outline-none"
        >
          {DURATION_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {d}s
            </option>
          ))}
        </select>
        <select
          value={data.aspectRatio}
          onChange={onRatioChange}
          className="w-14 px-1 py-1 text-[11px] bg-zinc-800 border border-white/10 rounded text-zinc-300 focus:outline-none"
        >
          {RATIO_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      {/* Generate button + inline cost preview */}
      <button
        type="button"
        disabled={isRunning || !data.prompt.trim()}
        onClick={() => {
          if (isRunning || !data.prompt.trim()) return;
          // Dispatch an inline-generate event; CanvasEditor mutates THIS node
          // (status='running' → poll → fill videoUrl) rather than spawning a
          // new node like canvas:regenerate does.
          window.dispatchEvent(new CustomEvent('canvas:generate-inline', { detail: { nodeId: id } }));
        }}
        className="w-full py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-purple-600 hover:bg-purple-500 text-white"
      >
        {isRunning ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {t.canvas_btn_generating}
          </>
        ) : (
          <>
            <Play className="w-3.5 h-3.5" />
            {t.canvas_btn_generate}
          </>
        )}
      </button>
      <div className="flex justify-end mt-1">
        <CostBadge
          kind="video"
          model={data.model}
          durationSec={data.duration}
        />
      </div>
    </NodeShell>
  );
};
