import React, { useCallback } from 'react';
import { type NodeProps } from '@xyflow/react';
import { Video, Play, Loader2 } from 'lucide-react';
import { NodeShell } from './NodeShell';
import { useCanvasStore } from '../canvasStore';
import { useLanguage } from '../../../context/LanguageContext';
import type { VideoNodeData, CanvasNode } from '../canvasTypes';

const MODEL_OPTIONS = [
  { value: 'kling', label: 'Kling' },
  { value: 'sora2', label: 'Sora 2' },
  { value: 'sora2pro', label: 'Sora 2 Pro' },
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
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateNodeData(id, { model: e.target.value });
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

      {/* Config row */}
      <div className="flex gap-1.5 mb-2">
        <select
          value={data.model}
          onChange={onModelChange}
          className="flex-1 px-1.5 py-1 text-[11px] bg-zinc-800 border border-white/10 rounded text-zinc-300 focus:outline-none"
        >
          {MODEL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          value={data.duration}
          onChange={onDurationChange}
          className="w-14 px-1 py-1 text-[11px] bg-zinc-800 border border-white/10 rounded text-zinc-300 focus:outline-none"
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

      {/* Generate button */}
      <button
        disabled={isRunning || !data.prompt.trim()}
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
    </NodeShell>
  );
};
