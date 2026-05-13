/**
 * UploadResourceNode — pure-source node (right handle only). Empty state
 * shows a hover-reveal picker with three buttons (Image / Video / Audio);
 * clicking one opens the canvas-wide `CreativeAssetPickerDialog` to pick
 * from the user's existing asset library. Local-disk upload is no longer
 * a path — users upload into the library via the regular asset workflow.
 *
 * Downstream consumption: see `canvasInputs.ts` `walk()` handling of
 * `kind === 'upload'` — image uploads flow into downstream prompts (hard
 * wall + caption). Video / audio uploads are stored on the node but not yet
 * folded into prompts; they're kept for visual graph context and future
 * generators that need them as input refs.
 */
import React, { useCallback, useState } from 'react';
import { type NodeProps } from '@xyflow/react';
import {
  Upload,
  ImageIcon,
  Video as VideoIcon,
  Music2,
  X,
  RefreshCw,
} from 'lucide-react';
import { NodeShell } from './NodeShell';
import { InputToggle } from './InputToggle';
import { useCanvasStore } from '../canvasStore';
import { useLanguage } from '../../../../context/LanguageContext';
import {
  CreativeAssetPickerDialog,
  type CreativeAssetPickerKind,
} from '../../CreativeAssetPickerDialog';
import type {
  UploadResourceNodeData,
  UploadResourceKind,
  CanvasNode,
} from '../canvasTypes';
import type { Asset } from '../../../../services/assets';

function formatDuration(sec?: number): string {
  if (!sec || !Number.isFinite(sec)) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Best-effort duration probe via HTMLAudioElement / HTMLVideoElement. */
async function probeDurationFromUrl(url: string, kind: 'audio' | 'video'): Promise<number | undefined> {
  return new Promise<number | undefined>((resolve) => {
    try {
      const el = kind === 'audio' ? new Audio() : document.createElement('video');
      el.preload = 'metadata';
      el.crossOrigin = 'anonymous';
      el.onloadedmetadata = () => resolve(el.duration);
      el.onerror = () => resolve(undefined);
      el.src = url;
    } catch {
      resolve(undefined);
    }
  });
}

const KIND_TO_PICKER: Record<UploadResourceKind, CreativeAssetPickerKind> = {
  image: 'product',
  video: 'motion',
  audio: 'audio',
};

export const UploadResourceNode: React.FC<NodeProps<CanvasNode>> = ({ id, data: rawData, selected }) => {
  const data = rawData as UploadResourceNodeData;
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const { t } = useLanguage();
  const tt = t as Record<string, string | undefined>;
  const useAsInput = data.useAsInput !== false;

  const [hovering, setHovering] = useState(false);
  const [pickerOpen, setPickerOpen] = useState<UploadResourceKind | null>(null);

  const setKind = useCallback(
    (kind: UploadResourceKind) => {
      updateNodeData(id, { resourceKind: kind } as Partial<UploadResourceNodeData>);
      // Open the picker right after — same flow as the old "click upload" UX.
      setPickerOpen(kind);
    },
    [id, updateNodeData],
  );

  const clearKind = useCallback(() => {
    updateNodeData(id, {
      resourceKind: null,
      imageUrl: null,
      imageCaption: undefined,
      videoUrl: null,
      videoName: undefined,
      videoDurationSec: undefined,
      audioUrl: null,
      audioName: undefined,
      audioDurationSec: undefined,
    } as Partial<UploadResourceNodeData>);
  }, [id, updateNodeData]);

  const openPickerForCurrentKind = useCallback(() => {
    if (data.resourceKind) setPickerOpen(data.resourceKind);
  }, [data.resourceKind]);

  const handleConfirm = useCallback(
    async (assets: Asset[]) => {
      const asset = assets[0];
      if (!asset) {
        setPickerOpen(null);
        return;
      }
      const url = asset.file_url;
      if (pickerOpen === 'image') {
        updateNodeData(id, {
          imageUrl: url,
          status: 'completed',
          error: undefined,
        } as Partial<UploadResourceNodeData>);
      } else if (pickerOpen === 'video') {
        updateNodeData(id, {
          videoUrl: url,
          videoName: asset.name,
          status: 'completed',
          error: undefined,
        } as Partial<UploadResourceNodeData>);
        // Probe duration asynchronously (non-blocking)
        void probeDurationFromUrl(url, 'video').then((d) => {
          if (d) updateNodeData(id, { videoDurationSec: d } as Partial<UploadResourceNodeData>);
        });
      } else if (pickerOpen === 'audio') {
        updateNodeData(id, {
          audioUrl: url,
          audioName: asset.name,
          status: 'completed',
          error: undefined,
        } as Partial<UploadResourceNodeData>);
        void probeDurationFromUrl(url, 'audio').then((d) => {
          if (d) updateNodeData(id, { audioDurationSec: d } as Partial<UploadResourceNodeData>);
        });
      }
      setPickerOpen(null);
    },
    [id, pickerOpen, updateNodeData],
  );

  return (
    <NodeShell
      icon={<Upload className="w-4 h-4" />}
      title={tt.canvas_node_upload || 'Upload Resource'}
      status={data.status}
      color="emerald"
      selected={selected}
      hasTarget={false}
      hasSource
      error={data.error}
      headerActions={
        data.resourceKind ? (
          <div className="flex items-center gap-1">
            <InputToggle
              active={useAsInput}
              onChange={(next) => updateNodeData(id, { useAsInput: next } as Partial<UploadResourceNodeData>)}
            />
            <button
              type="button"
              onClick={clearKind}
              title={tt.canvas_upload_change_kind || 'Change type'}
              className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-zinc-200"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
        ) : undefined
      }
    >
      <div
        className="min-w-[240px] max-w-[300px]"
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        {/* === Empty state — hover reveals 3 kind buttons === */}
        {!data.resourceKind && (
          <div className="relative h-24 rounded-md border-2 border-dashed border-emerald-500/30 bg-emerald-500/5 flex items-center justify-center">
            {hovering ? (
              <div className="flex gap-1.5">
                <KindBtn
                  icon={<ImageIcon className="w-3.5 h-3.5" />}
                  label={tt.canvas_upload_kind_image || 'Image'}
                  onClick={() => setKind('image')}
                />
                <KindBtn
                  icon={<VideoIcon className="w-3.5 h-3.5" />}
                  label={tt.canvas_upload_kind_video || 'Video'}
                  onClick={() => setKind('video')}
                />
                <KindBtn
                  icon={<Music2 className="w-3.5 h-3.5" />}
                  label={tt.canvas_upload_kind_audio || 'Audio'}
                  onClick={() => setKind('audio')}
                />
              </div>
            ) : (
              <div className="text-[11px] text-zinc-500 italic flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5" />
                {tt.canvas_upload_hover_hint || 'Hover to choose a type'}
              </div>
            )}
          </div>
        )}

        {/* === Image === */}
        {data.resourceKind === 'image' && (
          <div className="space-y-2">
            {data.imageUrl ? (
              <div className="relative group rounded-md overflow-hidden border border-white/5 bg-zinc-800">
                <img src={data.imageUrl} alt="upload" className="w-full h-32 object-cover" />
                <button
                  type="button"
                  onClick={() =>
                    updateNodeData(id, { imageUrl: null } as Partial<UploadResourceNodeData>)
                  }
                  className="absolute top-1 right-1 p-1 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={openPickerForCurrentKind}
                className="w-full h-24 rounded-md border-2 border-dashed border-emerald-500/30 hover:border-emerald-500/60 hover:bg-emerald-500/5 flex items-center justify-center gap-1.5 text-emerald-300 text-[11px]"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                {tt.canvas_btn_pick_from_library_image || 'Pick image from library'}
              </button>
            )}
            {/* Optional caption — same role as ImageNode.inputCaption */}
            {data.imageUrl && useAsInput && (
              <input
                type="text"
                value={data.imageCaption || ''}
                onChange={(e) => updateNodeData(id, { imageCaption: e.target.value } as Partial<UploadResourceNodeData>)}
                placeholder={tt.canvas_image_caption_placeholder || 'Caption (optional)'}
                className="w-full px-2 py-1 text-[11px] bg-zinc-800 border border-white/10 rounded text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/40"
              />
            )}
          </div>
        )}

        {/* === Video === */}
        {data.resourceKind === 'video' && (
          <div className="space-y-2">
            {data.videoUrl ? (
              <div className="rounded-md border border-white/5 bg-zinc-800 overflow-hidden">
                <video src={data.videoUrl} controls className="w-full h-36 bg-black" />
                <div className="px-2 py-1 flex items-center gap-2">
                  <VideoIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="text-[11px] text-zinc-300 truncate flex-1">
                    {data.videoName || 'video'}
                  </span>
                  {data.videoDurationSec ? (
                    <span className="text-[10px] text-zinc-500">{formatDuration(data.videoDurationSec)}</span>
                  ) : null}
                </div>
                <div className="px-2 pb-1 text-[10px] text-amber-400/80 italic">
                  {tt.canvas_upload_av_unused_hint || 'Stored on the canvas; not yet folded into prompts.'}
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={openPickerForCurrentKind}
                className="w-full h-24 rounded-md border-2 border-dashed border-emerald-500/30 hover:border-emerald-500/60 hover:bg-emerald-500/5 flex items-center justify-center gap-1.5 text-emerald-300 text-[11px]"
              >
                <VideoIcon className="w-3.5 h-3.5" />
                {tt.canvas_btn_pick_from_library_video || 'Pick video from library'}
              </button>
            )}
          </div>
        )}

        {/* === Audio === */}
        {data.resourceKind === 'audio' && (
          <div className="space-y-2">
            {data.audioUrl ? (
              <div className="rounded-md border border-white/5 bg-zinc-800 p-2 space-y-1">
                <div className="flex items-center gap-2">
                  <Music2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="text-[11px] text-zinc-300 truncate flex-1">
                    {data.audioName || 'audio'}
                  </span>
                  {data.audioDurationSec ? (
                    <span className="text-[10px] text-zinc-500">{formatDuration(data.audioDurationSec)}</span>
                  ) : null}
                </div>
                <audio src={data.audioUrl} controls className="w-full h-7" />
                <div className="text-[10px] text-amber-400/80 italic">
                  {tt.canvas_upload_av_unused_hint || 'Stored on the canvas; not yet folded into prompts.'}
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={openPickerForCurrentKind}
                className="w-full h-24 rounded-md border-2 border-dashed border-emerald-500/30 hover:border-emerald-500/60 hover:bg-emerald-500/5 flex items-center justify-center gap-1.5 text-emerald-300 text-[11px]"
              >
                <Music2 className="w-3.5 h-3.5" />
                {tt.canvas_btn_pick_from_library_audio || 'Pick audio from library'}
              </button>
            )}
          </div>
        )}
      </div>

      <CreativeAssetPickerDialog
        isOpen={pickerOpen !== null}
        kind={pickerOpen ? KIND_TO_PICKER[pickerOpen] : 'product'}
        onConfirm={handleConfirm}
        onClose={() => setPickerOpen(null)}
        autoSelectUploaded
      />
    </NodeShell>
  );
};

function KindBtn({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 hover:border-emerald-500/70 transition-colors"
    >
      {icon}
      {label}
    </button>
  );
}
