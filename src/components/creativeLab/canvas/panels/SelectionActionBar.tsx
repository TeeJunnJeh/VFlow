import React, { useState } from 'react';
import { Video, FileText, ImageIcon, Trash2, Copy, Play, Loader2, X, ScrollText, Film, LayoutGrid } from 'lucide-react';
import { useCanvasStore } from '../canvasStore';
import { useLanguage } from '../../../../context/LanguageContext';
import type { CanvasNodeData, VideoNodeData, CanvasNode, TextNodeData, ScriptNodeData, ImageNodeData } from '../canvasTypes';
import { CanvasModelChips, type CanvasModelChipOption } from './CanvasModelChips';
import { setCanvasToGalleryTransfer } from '../../canvasToGalleryTransfer';

const MODEL_OPTIONS: CanvasModelChipOption[] = [
  { value: 'kling', label: 'Kling', color: 'purple' },
  { value: 'sora2', label: 'Sora 2', color: 'purple' },
  { value: 'sora2pro', label: 'Sora 2 Pro', color: 'purple' },
  { value: 'seedance2.0', label: 'Seedance', color: 'purple' },
];

// Image gen models match productImages/Common/ModelSelectorChips so node + workspace stay in sync.
const IMAGE_MODEL_OPTIONS: CanvasModelChipOption[] = [
  { value: 'nano-banana-pro', label: 'NanoBanana Pro', color: 'blue' },
  { value: 'flux-2-pro', label: 'Flux 2 Pro', color: 'blue' },
  { value: 'gpt-image-1.5', label: 'GPT image 1.5', color: 'blue' },
];

const DURATION_OPTIONS = [5, 10, 15];
const RATIO_OPTIONS: VideoNodeData['aspectRatio'][] = ['9:16', '16:9', '1:1'];

let nodeIdCounter = 0;
function nextId() {
  return `node_${Date.now()}_${++nodeIdCounter}`;
}

type GenStep = null | 'choose' | 'video' | 'script' | 'image' | 'concat';

interface SelectionActionBarProps {
  onBatchGenerate?: (
    imageNodes: CanvasNode[],
    scriptNodes: CanvasNode[],
    textNodes: CanvasNode[],
    prompt: string,
    model: string,
    duration: number,
    aspectRatio: VideoNodeData['aspectRatio'],
    sound: boolean,
    scriptTextContext: string
  ) => void;
  onGenerateScript?: (
    imageNodes: CanvasNode[],
    textNodes: CanvasNode[],
    config: {
      category: string;
      style: string;
      shotCount: number;
      duration: number;
      aspectRatio: VideoNodeData['aspectRatio'];
      notes: string;
    }
  ) => void;
  onBatchGenerateImage?: (
    imageNodes: CanvasNode[],
    textNodes: CanvasNode[],
    prompt: string,
    model: string,
    aspectRatio: VideoNodeData['aspectRatio'],
    outputCount: number
  ) => void;
  onOpenInGallery?: () => void;
  onConcatenateVideos?: (videoNodes: CanvasNode[], orderedVideoUrls: string[]) => void;
}

export const SelectionActionBar: React.FC<SelectionActionBarProps> = ({ onBatchGenerate, onGenerateScript, onBatchGenerateImage, onOpenInGallery, onConcatenateVideos }) => {
  const { t } = useLanguage();
  const selectedNodes = useCanvasStore((s) => s.selectedNodes);
  const removeNodes = useCanvasStore((s) => s.removeNodes);
  const addNode = useCanvasStore((s) => s.addNode);

  const [step, setStep] = useState<GenStep>('choose');

  // Video config
  const [batchPrompt, setBatchPrompt] = useState('');
  const [batchModel, setBatchModel] = useState('kling');
  const [batchDuration, setBatchDuration] = useState(5);
  const [batchRatio, setBatchRatio] = useState<VideoNodeData['aspectRatio']>('9:16');
  const [batchSound, setBatchSound] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  // Script config
  const [scriptCategory, setScriptCategory] = useState('');
  const [scriptStyle, setScriptStyle] = useState('realistic');
  const [scriptShotCount, setScriptShotCount] = useState(5);
  const [scriptDuration, setScriptDuration] = useState(10);
  const [scriptNotes, setScriptNotes] = useState('');

  // Image config
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageModel, setImageModel] = useState('nano-banana-pro');
  const [imageRatio, setImageRatio] = useState<VideoNodeData['aspectRatio']>('9:16');
  const [imageOutputCount, setImageOutputCount] = useState(1);

  // Concat ordering — user manually reorders the selected videos before submitting.
  // Initial order populated when entering step='concat'; kept in sync with selection.
  const [concatOrder, setConcatOrder] = useState<string[]>([]);

  if (selectedNodes.length === 0) return null;

  // When the user selects exactly one image/video/text node, the new
  // BottomInputPanel handles configuration; the legacy SelectionActionBar
  // would otherwise stack on top of it. Yield to the panel for those kinds.
  if (selectedNodes.length === 1) {
    const onlyKind = (selectedNodes[0].data as CanvasNodeData).kind;
    if (onlyKind === 'image' || onlyKind === 'video' || onlyKind === 'text') {
      return null;
    }
  }

  // Categorize selected nodes
  const imageNodes = selectedNodes.filter((n) => (n.data as CanvasNodeData).kind === 'image');
  const textNodes = selectedNodes.filter((n) => (n.data as CanvasNodeData).kind === 'text');
  const videoNodes = selectedNodes.filter((n) => (n.data as CanvasNodeData).kind === 'video');
  const scriptNodes = selectedNodes.filter((n) => (n.data as CanvasNodeData).kind === 'script');

  // Build context from script + text nodes for video generation
  const hasScriptOrTextContext = scriptNodes.length > 0 || textNodes.length > 0;
  const scriptTextContext = (() => {
    const parts: string[] = [];
    textNodes.forEach((n) => {
      const d = n.data as TextNodeData;
      if (d.content.trim()) parts.push(d.content.trim());
    });
    scriptNodes.forEach((n) => {
      const d = n.data as ScriptNodeData;
      if (d.shots) {
        d.shots.forEach((shot) => {
          if (shot.visual) parts.push(`[Shot ${shot.shot_index}] ${shot.visual}`);
        });
      }
    });
    return parts.join('\n');
  })();

  const handleDeleteSelected = () => {
    removeNodes(selectedNodes.map((n) => n.id));
  };

  const handleCopySelected = () => {
    selectedNodes.forEach((node) => {
      const offset = { x: node.position.x + 40, y: node.position.y + 40 };
      addNode({
        ...node,
        id: nextId(),
        position: offset,
        selected: false,
      });
    });
  };

  const handleBatchGenerateVideo = async () => {
    if ((!batchPrompt.trim() && !hasScriptOrTextContext) || imageNodes.length === 0) return;
    setIsGenerating(true);
    try {
      onBatchGenerate?.(imageNodes, scriptNodes, textNodes, batchPrompt, batchModel, batchDuration, batchRatio, batchSound, scriptTextContext);
    } finally {
      setIsGenerating(false);
      setStep('choose');
    }
  };

  const handleGenerateScript = async () => {
    setIsGenerating(true);
    try {
      onGenerateScript?.(imageNodes, textNodes, {
        category: scriptCategory,
        style: scriptStyle,
        shotCount: scriptShotCount,
        duration: scriptDuration,
        aspectRatio: '16:9',
        notes: scriptNotes,
      });
    } finally {
      setIsGenerating(false);
      setStep('choose');
    }
  };

  const handleBatchGenerateImage = async () => {
    if (imageNodes.length === 0) return;
    setIsGenerating(true);
    try {
      onBatchGenerateImage?.(imageNodes, textNodes, imagePrompt, imageModel, imageRatio, imageOutputCount);
    } finally {
      setIsGenerating(false);
      setStep('choose');
    }
  };

  // "Open in Gallery" — single ImageNode with non-empty imageUrl
  const singleImageWithUrl = (() => {
    if (selectedNodes.length !== 1) return null;
    const n = selectedNodes[0];
    const d = n.data as ImageNodeData;
    if (d.kind !== 'image' || !d.imageUrl) return null;
    return { nodeId: n.id, imageUrl: d.imageUrl };
  })();

  const handleOpenInGallery = () => {
    if (!singleImageWithUrl || !onOpenInGallery) return;
    setCanvasToGalleryTransfer({
      productImageUrl: singleImageWithUrl.imageUrl,
      fromNodeId: singleImageWithUrl.nodeId,
    });
    onOpenInGallery();
  };

  // ---- Concatenate ----
  // Only completed VideoNodes with a videoUrl are eligible. Need 2+ to concat.
  const concatCandidates = videoNodes.filter((n) => {
    const d = n.data as VideoNodeData;
    return d.status === 'completed' && !!d.videoUrl;
  });
  const canConcatenate = concatCandidates.length >= 2;

  // When user opens the concat step, seed the order from current selection
  // sorted top-to-bottom by Y position (user choice from Q3 was reorderable).
  const openConcatStep = () => {
    const sorted = [...concatCandidates].sort((a, b) => a.position.y - b.position.y);
    setConcatOrder(sorted.map((n) => n.id));
    setStep('concat');
  };

  const moveConcatItem = (nodeId: string, direction: -1 | 1) => {
    setConcatOrder((prev) => {
      const idx = prev.indexOf(nodeId);
      if (idx < 0) return prev;
      const target = idx + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const handleSubmitConcat = async () => {
    if (concatOrder.length < 2) return;
    const orderedNodes: CanvasNode[] = [];
    const orderedUrls: string[] = [];
    concatOrder.forEach((id) => {
      const node = concatCandidates.find((n) => n.id === id);
      if (!node) return;
      const url = (node.data as VideoNodeData).videoUrl;
      if (!url) return;
      orderedNodes.push(node);
      orderedUrls.push(url);
    });
    if (orderedUrls.length < 2) return;
    setIsGenerating(true);
    try {
      onConcatenateVideos?.(orderedNodes, orderedUrls);
    } finally {
      setIsGenerating(false);
      setStep('choose');
    }
  };

  // Summary
  const parts: string[] = [];
  if (imageNodes.length > 0) parts.push(`${imageNodes.length} ${t.canvas_node_image}`);
  if (textNodes.length > 0) parts.push(`${textNodes.length} ${t.canvas_node_text}`);
  if (videoNodes.length > 0) parts.push(`${videoNodes.length} ${t.canvas_node_video}`);
  const summary = `${t.canvas_selected_count || ''} ${selectedNodes.length} (${parts.join(', ')})`;
  const basedOn = (t.canvas_gen_based_on || 'Based on {n} selected nodes').replace('{n}', String(selectedNodes.length));

  const STYLE_OPTIONS = [
    { value: 'realistic', label: t.canvas_gen_style_realistic },
    { value: 'anime', label: t.canvas_gen_style_anime },
    { value: '3d', label: t.canvas_gen_style_3d },
    { value: 'cinematic', label: t.canvas_gen_style_cinematic },
  ];

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 bg-zinc-900/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl shadow-black/50 min-w-[360px] max-w-[520px] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
        <span className="text-xs text-zinc-400">{summary}</span>
        <div className="flex items-center gap-1">
          {singleImageWithUrl && onOpenInGallery && (
            <button
              onClick={handleOpenInGallery}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-blue-300 hover:text-blue-200 hover:bg-blue-500/10 transition-colors"
              title="Open this image in the Gallery workspace"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Open in Gallery
            </button>
          )}
          <button
            onClick={handleCopySelected}
            className="p-1.5 rounded-md hover:bg-white/5 text-zinc-400 hover:text-zinc-200 transition-colors"
            title={t.canvas_btn_copy}
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleDeleteSelected}
            className="p-1.5 rounded-md hover:bg-red-500/10 text-zinc-400 hover:text-red-400 transition-colors"
            title={t.canvas_btn_delete_selected}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Step 1: Choose generation type */}
      {(step === 'choose' || step === null) && (
        <div className="p-4">
          <p className="text-[11px] text-zinc-500 mb-3">{t.canvas_select_gen_type}</p>
          <div className="grid grid-cols-3 gap-2">
            {/* Script Generation */}
            <button
              onClick={() => setStep('script')}
              className="flex flex-col items-center gap-2 p-3 rounded-lg border border-white/5 hover:border-orange-500/40 hover:bg-orange-500/5 transition-all group"
            >
              <div className="w-9 h-9 rounded-lg bg-orange-500/10 flex items-center justify-center group-hover:bg-orange-500/20 transition-colors">
                <ScrollText className="w-4.5 h-4.5 text-orange-400" />
              </div>
              <span className="text-[11px] text-zinc-300 font-medium">{t.canvas_gen_type_script}</span>
            </button>

            {/* Image Generation */}
            <button
              onClick={() => setStep('image')}
              disabled={imageNodes.length === 0}
              className="flex flex-col items-center gap-2 p-3 rounded-lg border border-white/5 hover:border-blue-500/40 hover:bg-blue-500/5 transition-all group disabled:opacity-40 disabled:cursor-not-allowed"
              title={imageNodes.length === 0 ? 'Select at least one image node as reference' : undefined}
            >
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                <ImageIcon className="w-4.5 h-4.5 text-blue-400" />
              </div>
              <span className="text-[11px] text-zinc-300 font-medium">{t.canvas_gen_type_image}</span>
            </button>

            {/* Video Generation */}
            <button
              onClick={() => setStep('video')}
              className="flex flex-col items-center gap-2 p-3 rounded-lg border border-white/5 hover:border-purple-500/40 hover:bg-purple-500/5 transition-all group"
            >
              <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">
                <Film className="w-4.5 h-4.5 text-purple-400" />
              </div>
              <span className="text-[11px] text-zinc-300 font-medium">{t.canvas_gen_type_video}</span>
            </button>
          </div>

          {/* Concatenate (only when 2+ completed VideoNodes are selected) */}
          {canConcatenate && onConcatenateVideos && (
            <div className="mt-3 pt-3 border-t border-white/5">
              <button
                onClick={openConcatStep}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-purple-500/30 bg-purple-500/5 hover:bg-purple-500/10 text-purple-200 transition-colors"
              >
                <Film className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">
                  {((t as Record<string, string | undefined>).canvas_concat_button || 'Concatenate {n} videos into one')
                    .replace('{n}', String(concatCandidates.length))}
                </span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 2d: Concatenate videos */}
      {step === 'concat' && (
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Film className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-medium text-zinc-200">
                {(t as Record<string, string | undefined>).canvas_concat_title || 'Concatenate Videos'}
              </span>
            </div>
            <button
              onClick={() => setStep('choose')}
              className="p-1 rounded hover:bg-white/5 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[10px] text-zinc-500">
            {(t as Record<string, string | undefined>).canvas_concat_help
              || 'Reorder with ↑/↓. Videos must share the same resolution; backend will reject mismatches.'}
          </p>

          <div className="space-y-1.5 max-h-[260px] overflow-y-auto custom-scroll">
            {concatOrder.map((nodeId, idx) => {
              const node = concatCandidates.find((n) => n.id === nodeId);
              if (!node) return null;
              const d = node.data as VideoNodeData;
              return (
                <div
                  key={nodeId}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-zinc-800/60 border border-white/5"
                >
                  <span className="text-[10px] font-bold text-zinc-400 w-4 text-center">{idx + 1}</span>
                  {d.thumbnailUrl ? (
                    <img src={d.thumbnailUrl} alt="" className="w-10 h-10 rounded object-cover bg-black/40" />
                  ) : (
                    <div className="w-10 h-10 rounded bg-black/40 flex items-center justify-center">
                      <Film className="w-4 h-4 text-zinc-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-zinc-300 truncate">
                      {d.prompt ? d.prompt.slice(0, 40) : `Video ${idx + 1}`}
                    </div>
                    <div className="text-[10px] text-zinc-500">
                      {d.duration}s · {d.aspectRatio} · {d.model}
                    </div>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => moveConcatItem(nodeId, -1)}
                      disabled={idx === 0}
                      className="p-0.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move up"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor"><path d="M6 3L2 7h8z" /></svg>
                    </button>
                    <button
                      onClick={() => moveConcatItem(nodeId, 1)}
                      disabled={idx === concatOrder.length - 1}
                      className="p-0.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move down"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor"><path d="M6 9l4-4H2z" /></svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => setStep('choose')}
              className="px-3 py-1.5 rounded-md text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
            >
              {t.canvas_gen_cancel || 'Cancel'}
            </button>
            <button
              onClick={handleSubmitConcat}
              disabled={isGenerating || concatOrder.length < 2}
              className="px-4 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-purple-600 hover:bg-purple-500 text-white"
            >
              {isGenerating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              {(t as Record<string, string | undefined>).canvas_concat_submit || 'Concatenate'}
            </button>
          </div>
        </div>
      )}

      {/* Step 2a: Video Generation Config */}
      {step === 'video' && (
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Film className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-medium text-zinc-200">{t.canvas_gen_type_video}</span>
            </div>
            <button
              onClick={() => setStep('choose')}
              className="p-1 rounded hover:bg-white/5 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[10px] text-zinc-500">{basedOn}</p>

          {/* Script/text context indicator */}
          {hasScriptOrTextContext && (
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-orange-500/10 border border-orange-500/20">
              <ScrollText className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
              <span className="text-[11px] text-orange-300">{t.canvas_video_has_script_context}</span>
            </div>
          )}

          {/* Prompt */}
          <textarea
            value={batchPrompt}
            onChange={(e) => setBatchPrompt(e.target.value)}
            placeholder={hasScriptOrTextContext ? t.canvas_video_supplement_prompt : t.canvas_prompt_input_placeholder}
            rows={2}
            className="w-full px-2.5 py-1.5 text-xs bg-zinc-800 border border-white/10 rounded-md text-zinc-300 resize-none focus:outline-none focus:border-purple-500/50"
          />

          {/* Model picker (chip row) */}
          <div>
            <label className="text-[10px] text-zinc-500 mb-1.5 block">{t.canvas_node_video}</label>
            <CanvasModelChips
              value={batchModel}
              onChange={setBatchModel}
              options={MODEL_OPTIONS}
              size="sm"
            />
          </div>

          {/* Config row */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-zinc-500 mb-1 block">{t.canvas_btn_generate}</label>
              <select
                value={batchDuration}
                onChange={(e) => setBatchDuration(Number(e.target.value))}
                className="w-full px-1.5 py-1 text-[11px] bg-zinc-800 border border-white/10 rounded text-zinc-300 focus:outline-none"
              >
                {DURATION_OPTIONS.map((d) => (
                  <option key={d} value={d}>{d}s</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 mb-1 block">Ratio</label>
              <select
                value={batchRatio}
                onChange={(e) => setBatchRatio(e.target.value as VideoNodeData['aspectRatio'])}
                className="w-full px-1.5 py-1 text-[11px] bg-zinc-800 border border-white/10 rounded text-zinc-300 focus:outline-none"
              >
                {RATIO_OPTIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 mb-1 block">{t.canvas_gen_sound}</label>
              <select
                value={batchSound ? 'on' : 'off'}
                onChange={(e) => setBatchSound(e.target.value === 'on')}
                className="w-full px-1.5 py-1 text-[11px] bg-zinc-800 border border-white/10 rounded text-zinc-300 focus:outline-none"
              >
                <option value="on">{t.canvas_gen_sound_on}</option>
                <option value="off">{t.canvas_gen_sound_off}</option>
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => setStep('choose')}
              className="px-3 py-1.5 rounded-md text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
            >
              {t.canvas_gen_cancel}
            </button>
            <button
              onClick={handleBatchGenerateVideo}
              disabled={isGenerating || (!batchPrompt.trim() && !hasScriptOrTextContext)}
              className="px-4 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-purple-600 hover:bg-purple-500 text-white"
            >
              {isGenerating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              {t.canvas_gen_start_video}
            </button>
          </div>
        </div>
      )}

      {/* Step 2c: Image Generation Config */}
      {step === 'image' && (
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-medium text-zinc-200">{t.canvas_gen_type_image}</span>
            </div>
            <button
              onClick={() => setStep('choose')}
              className="p-1 rounded hover:bg-white/5 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[10px] text-zinc-500">{basedOn}</p>

          {/* Model chip row */}
          <div>
            <label className="text-[10px] text-zinc-500 mb-1.5 block">{t.canvas_node_image}</label>
            <CanvasModelChips
              value={imageModel}
              onChange={setImageModel}
              options={IMAGE_MODEL_OPTIONS}
              size="sm"
            />
          </div>

          {/* Prompt */}
          <textarea
            value={imagePrompt}
            onChange={(e) => setImagePrompt(e.target.value)}
            placeholder={t.canvas_prompt_input_placeholder}
            rows={2}
            className="w-full px-2.5 py-1.5 text-xs bg-zinc-800 border border-white/10 rounded-md text-zinc-300 resize-none focus:outline-none focus:border-blue-500/50"
          />

          {/* Ratio + Count */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-zinc-500 mb-1 block">Ratio</label>
              <select
                value={imageRatio}
                onChange={(e) => setImageRatio(e.target.value as VideoNodeData['aspectRatio'])}
                className="w-full px-1.5 py-1 text-[11px] bg-zinc-800 border border-white/10 rounded text-zinc-300 focus:outline-none"
              >
                {RATIO_OPTIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 mb-1 block">{t.canvas_node_image} × N</label>
              <select
                value={imageOutputCount}
                onChange={(e) => setImageOutputCount(Number(e.target.value))}
                className="w-full px-1.5 py-1 text-[11px] bg-zinc-800 border border-white/10 rounded text-zinc-300 focus:outline-none"
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => setStep('choose')}
              className="px-3 py-1.5 rounded-md text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
            >
              {t.canvas_gen_cancel}
            </button>
            <button
              onClick={handleBatchGenerateImage}
              disabled={isGenerating || imageNodes.length === 0}
              className="px-4 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-500 text-white"
            >
              {isGenerating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              {t.canvas_btn_generate}
            </button>
          </div>
        </div>
      )}

      {/* Step 2b: Script Generation Config */}
      {step === 'script' && (
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ScrollText className="w-4 h-4 text-orange-400" />
              <span className="text-xs font-medium text-zinc-200">{t.canvas_gen_type_script}</span>
            </div>
            <button
              onClick={() => setStep('choose')}
              className="p-1 rounded hover:bg-white/5 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[10px] text-zinc-500">{basedOn}</p>

          {/* Config grid */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-zinc-500 mb-1 block">{t.canvas_gen_product_category}</label>
              <input
                type="text"
                value={scriptCategory}
                onChange={(e) => setScriptCategory(e.target.value)}
                className="w-full px-2 py-1 text-[11px] bg-zinc-800 border border-white/10 rounded text-zinc-300 focus:outline-none focus:border-orange-500/50"
              />
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 mb-1 block">{t.canvas_gen_visual_style}</label>
              <select
                value={scriptStyle}
                onChange={(e) => setScriptStyle(e.target.value)}
                className="w-full px-1.5 py-1 text-[11px] bg-zinc-800 border border-white/10 rounded text-zinc-300 focus:outline-none"
              >
                {STYLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 mb-1 block">{t.canvas_gen_shot_count}</label>
              <select
                value={scriptShotCount}
                onChange={(e) => setScriptShotCount(Number(e.target.value))}
                className="w-full px-1.5 py-1 text-[11px] bg-zinc-800 border border-white/10 rounded text-zinc-300 focus:outline-none"
              >
                {[3, 5, 7, 10].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 mb-1 block">{t.canvas_btn_generate}</label>
              <select
                value={scriptDuration}
                onChange={(e) => setScriptDuration(Number(e.target.value))}
                className="w-full px-1.5 py-1 text-[11px] bg-zinc-800 border border-white/10 rounded text-zinc-300 focus:outline-none"
              >
                {[5, 10, 15, 30, 60].map((d) => (
                  <option key={d} value={d}>{d}s</option>
                ))}
              </select>
            </div>
          </div>

          {/* Extra notes */}
          <div>
            <label className="text-[10px] text-zinc-500 mb-1 block">{t.canvas_gen_extra_notes}</label>
            <textarea
              value={scriptNotes}
              onChange={(e) => setScriptNotes(e.target.value)}
              rows={2}
              className="w-full px-2.5 py-1.5 text-xs bg-zinc-800 border border-white/10 rounded-md text-zinc-300 resize-none focus:outline-none focus:border-orange-500/50"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => setStep('choose')}
              className="px-3 py-1.5 rounded-md text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
            >
              {t.canvas_gen_cancel}
            </button>
            <button
              onClick={handleGenerateScript}
              className="px-4 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors bg-orange-600 hover:bg-orange-500 text-white"
            >
              <ScrollText className="w-3.5 h-3.5" />
              {t.canvas_gen_start_script}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
