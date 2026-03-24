import React, { useState } from 'react';
import { Video, FileText, ImageIcon, Trash2, Copy, Play, Loader2, X, ScrollText, Film } from 'lucide-react';
import { useCanvasStore } from '../canvasStore';
import { useLanguage } from '../../../context/LanguageContext';
import type { CanvasNodeData, VideoNodeData, CanvasNode } from '../canvasTypes';

const MODEL_OPTIONS = [
  { value: 'kling', label: 'Kling' },
  { value: 'sora2', label: 'Sora 2' },
  { value: 'sora2pro', label: 'Sora 2 Pro' },
];

const DURATION_OPTIONS = [5, 10, 15];
const RATIO_OPTIONS: VideoNodeData['aspectRatio'][] = ['9:16', '16:9', '1:1'];

let nodeIdCounter = 0;
function nextId() {
  return `node_${Date.now()}_${++nodeIdCounter}`;
}

type GenStep = null | 'choose' | 'video' | 'script';

interface SelectionActionBarProps {
  onBatchGenerate?: (
    imageNodes: CanvasNode[],
    prompt: string,
    model: string,
    duration: number,
    aspectRatio: VideoNodeData['aspectRatio']
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
}

export const SelectionActionBar: React.FC<SelectionActionBarProps> = ({ onBatchGenerate, onGenerateScript }) => {
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

  if (selectedNodes.length === 0) return null;

  // Categorize selected nodes
  const imageNodes = selectedNodes.filter((n) => (n.data as CanvasNodeData).kind === 'image');
  const textNodes = selectedNodes.filter((n) => (n.data as CanvasNodeData).kind === 'text');
  const videoNodes = selectedNodes.filter((n) => (n.data as CanvasNodeData).kind === 'video');

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
    if (!batchPrompt.trim() || imageNodes.length === 0) return;
    setIsGenerating(true);
    try {
      onBatchGenerate?.(imageNodes, batchPrompt, batchModel, batchDuration, batchRatio);
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

            {/* Image Generation (placeholder) */}
            <button
              disabled
              className="flex flex-col items-center gap-2 p-3 rounded-lg border border-white/5 opacity-40 cursor-not-allowed"
            >
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
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

          {/* Prompt */}
          <textarea
            value={batchPrompt}
            onChange={(e) => setBatchPrompt(e.target.value)}
            placeholder={t.canvas_prompt_input_placeholder}
            rows={2}
            className="w-full px-2.5 py-1.5 text-xs bg-zinc-800 border border-white/10 rounded-md text-zinc-300 resize-none focus:outline-none focus:border-purple-500/50"
          />

          {/* Config row */}
          <div className="grid grid-cols-4 gap-2">
            <div>
              <label className="text-[10px] text-zinc-500 mb-1 block">{t.canvas_node_video}</label>
              <select
                value={batchModel}
                onChange={(e) => setBatchModel(e.target.value)}
                className="w-full px-1.5 py-1 text-[11px] bg-zinc-800 border border-white/10 rounded text-zinc-300 focus:outline-none"
              >
                {MODEL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
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
              disabled={isGenerating || !batchPrompt.trim()}
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
