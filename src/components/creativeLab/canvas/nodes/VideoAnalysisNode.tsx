import React, { useCallback, useRef, useState } from 'react';
import { type NodeProps } from '@xyflow/react';
import { Film, Loader2, Upload, ScrollText } from 'lucide-react';
import { NodeShell } from './NodeShell';
import { useCanvasStore } from '../canvasStore';
import { useLanguage } from '../../../../context/LanguageContext';
import type { VideoAnalysisNodeData, ScriptNodeData, CanvasNode } from '../canvasTypes';
import { videoApi } from '../../../../services/video';
import { assetsApi } from '../../../../services/assets';
import { formatReplayReverseScript, pickReplayScripts } from '../../replayReverseScript';

interface VideoAnalysisNodeActions {
  userId?: number | string;
  onDeriveToScript?: (nodeId: string, scriptText: string) => void;
}

let analysisNodeIdCounter = 0;
function nextAnalysisId() {
  return `node_${Date.now()}_${++analysisNodeIdCounter}`;
}

export const VideoAnalysisNode: React.FC<NodeProps<CanvasNode> & VideoAnalysisNodeActions> = ({
  id,
  data: rawData,
  selected,
}) => {
  const data = rawData as VideoAnalysisNodeData;
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const addNode = useCanvasStore((s) => s.addNode);
  const onConnect = useCanvasStore((s) => s.onConnect);
  const { t } = useLanguage();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const isRunning = data.status === 'running' || uploading;
  const hasResult = data.extractedScript && data.extractedScript.length > 0;

  const handleSelectFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = '';

      setUploading(true);
      try {
        // Show local preview immediately
        const blobUrl = URL.createObjectURL(file);
        updateNodeData(id, {
          sourceVideoUrl: blobUrl,
          status: 'running',
          error: undefined,
        } as Partial<VideoAnalysisNodeData>);

        // Upload to server
        const uploadResp = await assetsApi.uploadTempAsset(file);
        const serverPath = uploadResp?.url || uploadResp?.data?.url || uploadResp?.file_url || uploadResp?.path;
        if (!serverPath) throw new Error('Upload failed');

        updateNodeData(id, { sourceVideoPath: String(serverPath) } as Partial<VideoAnalysisNodeData>);

        // Run reverse script analysis. userId from context not available in plain node; use 'me'.
        const apiResp = await videoApi.reverseScriptFromVideo('me', {
          video_path: String(serverPath),
        });
        const payload = (apiResp as any)?.data || apiResp;

        const bundle = pickReplayScripts(payload);
        const displayScript = bundle.displayScript || formatReplayReverseScript(payload);

        // Extract style tags from overall features (best-effort)
        const tagsRaw = (payload as any)?.overallFeatures || (payload as any)?.overall_features
          || ((payload as any)?.scriptArchitecture || (payload as any)?.script_architecture || {})?.overall_features
          || {};
        const styleTags: string[] = [];
        ['style', 'tone_pacing', 'lighting', 'emotion_atmosphere'].forEach((key) => {
          const v = (tagsRaw as any)?.[key];
          if (typeof v === 'string' && v.trim()) styleTags.push(v.trim().slice(0, 20));
        });

        updateNodeData(id, {
          status: 'completed',
          extractedScript: displayScript,
          seedancePrompt: bundle.seedanceScript,
          styleTags,
        } as Partial<VideoAnalysisNodeData>);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Reverse analysis failed';
        updateNodeData(id, { status: 'failed', error: msg } as Partial<VideoAnalysisNodeData>);
      } finally {
        setUploading(false);
      }
    },
    [id, updateNodeData]
  );

  const handleDeriveToScript = useCallback(() => {
    if (!hasResult) return;

    // Create a minimal ScriptNode whose shots field holds a single synthetic shot summarizing
    // the reverse-extracted prompt. Real shot-by-shot parsing requires deeper backend cooperation
    // and is deferred; this still lets downstream Video nodes consume the extracted intent.
    const newId = nextAnalysisId();
    const syntheticShot = {
      shot_index: 1,
      type: 'Reference',
      duration_sec: 5,
      visual: (data.extractedScript || '').slice(0, 400),
      audio: '',
      voiceover: '',
    };
    const scriptData: ScriptNodeData = {
      kind: 'script',
      label: 'Reverse Script',
      status: 'completed',
      shots: [syntheticShot],
      productCategory: '',
      visualStyle: (data.styleTags || [])[0] || '',
      aspectRatio: '9:16',
      totalDuration: 5,
      shotCount: 1,
      sourceImagePaths: [],
    };
    addNode({
      id: newId,
      type: 'script',
      position: { x: 350, y: 0 }, // ReactFlow will place; the parent canvas handles layout
      data: scriptData,
    } as CanvasNode);
    onConnect({ source: id, target: newId, sourceHandle: null, targetHandle: null });
  }, [id, hasResult, data, addNode, onConnect]);

  return (
    <NodeShell
      icon={<Film className="w-4 h-4" />}
      title={t.canvas_node_video || 'Video Analysis'}
      status={data.status}
      color="emerald"
      selected={selected}
      error={data.error}
    >
      <div className="min-w-[280px] max-w-[360px]">
        {/* Source video preview */}
        {data.sourceVideoUrl ? (
          <video
            src={data.sourceVideoUrl}
            controls
            className="w-full h-32 rounded-md border border-white/5 bg-black mb-2"
          />
        ) : (
          <button
            onClick={handleSelectFile}
            className="w-full h-32 mb-2 rounded-md border border-dashed border-white/15 bg-zinc-800/40 flex flex-col items-center justify-center text-zinc-500 hover:text-zinc-300 hover:border-emerald-500/40 transition-colors"
          >
            <Upload className="w-5 h-5 mb-1" />
            <span className="text-[11px]">Click to upload reference video</span>
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Loading */}
        {isRunning && (
          <div className="flex items-center justify-center gap-2 py-3">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
            <span className="text-[11px] text-zinc-400">
              {uploading ? 'Uploading...' : 'Analyzing video...'}
            </span>
          </div>
        )}

        {/* Style tags */}
        {!isRunning && data.styleTags && data.styleTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {data.styleTags.map((tag, idx) => (
              <span
                key={idx}
                className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-200 border border-emerald-500/30"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Extracted script preview */}
        {!isRunning && hasResult && (
          <div className="max-h-32 overflow-y-auto custom-scroll nowheel mb-2 text-[10px] text-zinc-300 bg-zinc-800/60 border border-white/5 rounded-md p-2 whitespace-pre-wrap leading-relaxed">
            {(data.extractedScript || '').slice(0, 600)}
            {(data.extractedScript || '').length > 600 ? '…' : ''}
          </div>
        )}

        {/* Derive to script button */}
        {!isRunning && hasResult && (
          <button
            onClick={handleDeriveToScript}
            className="w-full py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 bg-orange-600 hover:bg-orange-500 text-white transition-colors"
          >
            <ScrollText className="w-3.5 h-3.5" />
            Derive to Script
          </button>
        )}

        {/* Re-upload */}
        {data.sourceVideoUrl && !isRunning && (
          <button
            onClick={handleSelectFile}
            className="w-full mt-1.5 py-1 rounded-md text-[10px] text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
          >
            Replace video
          </button>
        )}
      </div>
    </NodeShell>
  );
};
