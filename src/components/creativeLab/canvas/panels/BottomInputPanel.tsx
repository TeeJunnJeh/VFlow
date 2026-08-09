/**
 * BottomInputPanel — single global config panel anchored to the bottom of the
 * canvas. Opens when a node is single-clicked / single-selected, hides when
 * 0 or 2+ nodes are selected (multi-select goes through SelectionActionBar).
 *
 * The panel renders three sub-forms depending on the active node kind:
 *   - ImageNode   → feature chip (first_frame/smart_repair/clothing_swap/ai_model)
 *                    + secondary params + prompt + Generate (runs imageGenHandlers)
 *   - VideoNode   → model chip (kling/sora2/sora2pro/seedance2.5) + duration
 *                    + aspect ratio + prompt + Generate (dispatches
 *                    `canvas:generate-inline` for CanvasEditor to handle)
 *   - TextNode    → script kind chip (master/full) + style/shotCount/duration
 *                    + prompt + Generate (calls onGenerateScript prop which
 *                    spawns a ScriptNode connected from this text node)
 */
import React, { useCallback, useMemo } from 'react';
import { X, Play, Wand2 } from 'lucide-react';
import { useLanguage } from '../../../../context/LanguageContext';
import { SmartDurationToggle } from '../../../common/SmartDurationToggle';
import { useCanvasStore } from '../canvasStore';
import { CanvasModelChips, type CanvasModelChipOption } from './CanvasModelChips';
import { CostBadge } from '../nodes/imageModes/CostBadge';
import type {
  CanvasNode,
  CanvasNodeData,
  ImageNodeData,
  VideoNodeData,
  TextNodeData,
} from '../canvasTypes';

interface BottomInputPanelProps {
  /** The single currently-selected node (panel hidden when null). */
  activeNode: CanvasNode | null;
  onClose: () => void;
  /** ImageNode → calls imageGenHandlers.runGeneration */
  onGenerateImage: (nodeId: string) => void;
  /** VideoNode → dispatches canvas:generate-inline event */
  onGenerateVideo: (nodeId: string) => void;
  /** TextNode → spawns a ScriptNode connected from this node */
  onGenerateScript: (
    sourceTextNode: CanvasNode,
    config: {
      withShots: boolean;
      style: string;
      shotCount: number;
      duration: number;
      aspectRatio: VideoNodeData['aspectRatio'];
    },
  ) => void;
}

const IMAGE_FEATURE_CHIPS: { value: NonNullable<ImageNodeData['mode']>; label: string }[] = [
  { value: 'first_frame', label: 'canvas_panel_feat_first_frame' },
  { value: 'smart_repair', label: 'canvas_panel_feat_smart_repair' },
  { value: 'clothing_swap', label: 'canvas_panel_feat_clothing_swap' },
  { value: 'ai_model', label: 'canvas_panel_feat_ai_model' },
];

const VIDEO_MODEL_CHIPS: CanvasModelChipOption[] = [
  { value: 'kling', label: 'Kling', color: 'purple' },
  { value: 'sora2', label: 'Sora 2', color: 'purple' },
  { value: 'sora2pro', label: 'Sora 2 Pro', color: 'purple' },
  { value: 'seedance2.5', label: 'Seedance', color: 'purple' },
];

const IMAGE_MODEL_CHIPS: CanvasModelChipOption[] = [
  { value: 'nano-banana-pro', label: 'NanoBanana Pro', color: 'blue' },
  { value: 'flux-2-pro', label: 'Flux 2 Pro', color: 'blue' },
  { value: 'gpt-image-1.5', label: 'GPT image 1.5', color: 'blue' },
];

const DURATION_OPTIONS = [4, 5, 10, 15, 20, 30];
const RATIO_OPTIONS: VideoNodeData['aspectRatio'][] = ['adaptive', '21:9', '9:16', '16:9', '4:3', '1:1', '3:4'];

export const BottomInputPanel: React.FC<BottomInputPanelProps> = ({
  activeNode,
  onClose,
  onGenerateImage,
  onGenerateVideo,
  onGenerateScript,
}) => {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const { t } = useLanguage();
  const tt = t as Record<string, string | undefined>;

  // Hooks below need to run unconditionally on every render. We defer the
  // null-return to AFTER all hooks fire.
  const data = activeNode?.data as CanvasNodeData | undefined;
  const kind = data?.kind;

  const isRunning = activeNode?.data?.status === 'running';

  if (!activeNode || !data) return null;
  if (kind !== 'image' && kind !== 'video' && kind !== 'text') return null;

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[640px] max-w-[calc(100vw-2rem)] bg-zinc-900/95 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl shadow-black/40">
      {/* === Header === */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-white/5">
        <NodeBadge kind={kind} />
        <div className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-zinc-200"
          title={tt.canvas_panel_close || 'Close'}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* === Body === */}
      <div className="p-3 space-y-3">
        {kind === 'image' && (
          <ImagePanelBody
            nodeId={activeNode.id}
            data={data as ImageNodeData}
            updateNodeData={updateNodeData}
            isRunning={isRunning}
            onGenerate={() => onGenerateImage(activeNode.id)}
          />
        )}
        {kind === 'video' && (
          <VideoPanelBody
            nodeId={activeNode.id}
            data={data as VideoNodeData}
            updateNodeData={updateNodeData}
            isRunning={isRunning}
            onGenerate={() => onGenerateVideo(activeNode.id)}
          />
        )}
        {kind === 'text' && (
          <TextPanelBody
            node={activeNode}
            data={data as TextNodeData}
            isRunning={isRunning}
            onGenerate={(cfg) => onGenerateScript(activeNode, cfg)}
          />
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Header badge
// ---------------------------------------------------------------------------

function NodeBadge({ kind }: { kind: 'image' | 'video' | 'text' }) {
  const { t } = useLanguage();
  const tt = t as Record<string, string | undefined>;
  const style = kind === 'image'
    ? 'bg-blue-500/15 text-blue-200 border-blue-500/30'
    : kind === 'video'
      ? 'bg-purple-500/15 text-purple-200 border-purple-500/30'
      : 'bg-orange-500/15 text-orange-200 border-orange-500/30';
  const label = kind === 'image'
    ? tt.canvas_node_image || 'Image'
    : kind === 'video'
      ? tt.canvas_node_video || 'Video'
      : tt.canvas_node_text || 'Text';
  return (
    <span className={`text-[11px] font-semibold px-2 py-1 rounded-md border ${style}`}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Image panel
// ---------------------------------------------------------------------------

interface ImagePanelBodyProps {
  nodeId: string;
  data: ImageNodeData;
  updateNodeData: (id: string, partial: Partial<ImageNodeData>) => void;
  isRunning: boolean;
  onGenerate: () => void;
}

const ImagePanelBody: React.FC<ImagePanelBodyProps> = ({ nodeId, data, updateNodeData, isRunning, onGenerate }) => {
  const { t } = useLanguage();
  const tt = t as Record<string, string | undefined>;
  const mode = data.mode || 'first_frame';
  const outputCount = data.outputCount || 1;

  // Generation-mode is selected via this chip row (was inline in legacy nodes).
  const featureChips = IMAGE_FEATURE_CHIPS.map((c) => ({
    value: c.value,
    label: tt[c.label] || c.value,
  }));

  // Prompt textarea — bound to mode-specific field on the node data.
  const promptValue = useMemo(() => {
    switch (mode) {
      case 'first_frame': return data.firstFramePrompt || '';
      case 'smart_repair': return data.smartRepairPrompt || '';
      case 'clothing_swap': return ''; // clothing_swap has no prompt field; placeholder shown
      case 'ai_model': return data.aiModelMode === 'real'
        ? (data.aiModelRealBrief || '')
        : (data.aiModelPrompt || '');
      default: return '';
    }
  }, [mode, data]);

  const setPrompt = useCallback(
    (v: string) => {
      const patch: Partial<ImageNodeData> = {};
      if (mode === 'first_frame') patch.firstFramePrompt = v;
      else if (mode === 'smart_repair') patch.smartRepairPrompt = v;
      else if (mode === 'ai_model') {
        if (data.aiModelMode === 'real') patch.aiModelRealBrief = v;
        else patch.aiModelPrompt = v;
      }
      updateNodeData(nodeId, patch);
    },
    [nodeId, updateNodeData, mode, data.aiModelMode],
  );

  // Effective model for cost preview (defaults follow each mode's runtime default)
  const effectiveModel = mode === 'first_frame'
    ? (data.firstFrameModel || 'nano-banana-pro')
    : mode === 'smart_repair'
      ? (data.smartRepairModel || 'flux-2-pro')
      : mode === 'clothing_swap'
        ? 'clothing-swap'
        : 'nano-banana-pro'; // ai_model uses nano-banana-pro pricing alias

  const promptPlaceholder = mode === 'clothing_swap'
    ? (tt.canvas_panel_clothing_swap_hint || 'Clothing swap needs 2 upstream images: model + garment. No prompt required.')
    : mode === 'ai_model' && data.aiModelMode === 'real'
      ? (tt.canvas_panel_ai_real_brief_ph || 'Describe how to edit the real person...')
      : (tt.canvas_panel_image_prompt_ph || 'Describe the desired result...');

  const canGenerate = !isRunning && (
    mode === 'clothing_swap'
      ? true
      : promptValue.trim().length > 0
  );

  return (
    <>
      {/* Feature chip row */}
      <div className="flex flex-wrap gap-1.5">
        {featureChips.map((chip) => {
          const active = mode === chip.value;
          return (
            <button
              key={chip.value}
              type="button"
              onClick={() => updateNodeData(nodeId, { mode: chip.value })}
              className={`px-2.5 py-1 text-[11px] rounded-md border transition-colors ${
                active
                  ? 'border-blue-500/70 bg-blue-500/15 text-blue-200'
                  : 'border-white/10 bg-zinc-800/60 text-zinc-400 hover:border-white/25 hover:text-zinc-200'
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* Prompt textarea */}
      <textarea
        value={promptValue}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={promptPlaceholder}
        rows={3}
        disabled={mode === 'clothing_swap'}
        className="w-full px-2.5 py-2 text-xs bg-zinc-800 border border-white/10 rounded-md text-zinc-300 placeholder:text-zinc-600 resize-none focus:outline-none focus:border-blue-500/40 disabled:opacity-50"
      />

      {/* Secondary params + Generate */}
      <div className="flex flex-wrap items-center gap-2">
        {mode === 'first_frame' && (
          <CanvasModelChips
            value={data.firstFrameModel || 'nano-banana-pro'}
            onChange={(next) => updateNodeData(nodeId, { firstFrameModel: next as ImageNodeData['firstFrameModel'] })}
            options={IMAGE_MODEL_CHIPS}
            size="xs"
          />
        )}
        {mode === 'smart_repair' && (
          <>
            <CanvasModelChips
              value={data.smartRepairModel || 'flux-2-pro'}
              onChange={(next) => updateNodeData(nodeId, { smartRepairModel: next as ImageNodeData['smartRepairModel'] })}
              options={IMAGE_MODEL_CHIPS}
              size="xs"
            />
            <SegPicker
              value={data.smartRepairStrength || 'medium'}
              options={[
                { value: 'light', label: tt.canvas_strength_light || 'Light' },
                { value: 'medium', label: tt.canvas_strength_medium || 'Medium' },
                { value: 'strong', label: tt.canvas_strength_strong || 'Strong' },
              ]}
              onChange={(v) =>
                updateNodeData(nodeId, { smartRepairStrength: v as ImageNodeData['smartRepairStrength'] })
              }
            />
          </>
        )}
        {mode === 'clothing_swap' && (
          <SegPicker
            value={data.clothingSwapCategory || 'top'}
            options={[
              { value: 'top', label: tt.canvas_cs_top || 'Top' },
              { value: 'bottom', label: tt.canvas_cs_bottom || 'Bottom' },
              { value: 'full_body', label: tt.canvas_cs_full_body || 'Full Body' },
            ]}
            onChange={(v) =>
              updateNodeData(nodeId, { clothingSwapCategory: v as ImageNodeData['clothingSwapCategory'] })
            }
          />
        )}
        {mode === 'ai_model' && (
          <>
            <SegPicker
              value={data.aiModelMode || 'virtual'}
              options={[
                { value: 'virtual', label: tt.canvas_ai_mode_virtual || 'Virtual' },
                { value: 'real', label: tt.canvas_ai_mode_real || 'Real Person' },
              ]}
              onChange={(v) => updateNodeData(nodeId, { aiModelMode: v as ImageNodeData['aiModelMode'] })}
            />
            {(data.aiModelMode || 'virtual') === 'virtual' && (
              <SegPicker
                value={data.aiModelGender || 'no_limit'}
                options={[
                  { value: 'female', label: tt.canvas_gender_female || 'F' },
                  { value: 'male', label: tt.canvas_gender_male || 'M' },
                  { value: 'no_limit', label: tt.canvas_gender_no_limit || 'Any' },
                ]}
                onChange={(v) => updateNodeData(nodeId, { aiModelGender: v as ImageNodeData['aiModelGender'] })}
              />
            )}
          </>
        )}

        {/* Output count (1~4) — applies to all four image features */}
        <select
          value={outputCount}
          onChange={(e) =>
            updateNodeData(nodeId, { outputCount: Number(e.target.value) as ImageNodeData['outputCount'] })
          }
          className="px-2 py-1 text-[11px] bg-zinc-800 border border-white/10 rounded text-zinc-300 focus:outline-none"
        >
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>{n}×</option>
          ))}
        </select>

        <div className="flex-1" />

        <CostBadge kind="image" model={effectiveModel} outputCount={outputCount} />
        <button
          type="button"
          onClick={onGenerate}
          disabled={!canGenerate}
          className="ml-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Play className="w-3.5 h-3.5" />
          {tt.canvas_btn_generate || 'Generate'}
        </button>
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// Video panel
// ---------------------------------------------------------------------------

interface VideoPanelBodyProps {
  nodeId: string;
  data: VideoNodeData;
  updateNodeData: (id: string, partial: Partial<VideoNodeData>) => void;
  isRunning: boolean;
  onGenerate: () => void;
}

const VideoPanelBody: React.FC<VideoPanelBodyProps> = ({ nodeId, data, updateNodeData, isRunning, onGenerate }) => {
  const { t } = useLanguage();
  const tt = t as Record<string, string | undefined>;
  const canGenerate = !isRunning && (data.prompt || '').trim().length > 0;

  return (
    <>
      <CanvasModelChips
        value={data.model}
        onChange={(next) => updateNodeData(nodeId, {
          model: next,
          ...(next !== 'seedance2.5' && data.duration === -1 ? { duration: 10 } : {}),
        })}
        options={VIDEO_MODEL_CHIPS}
        size="sm"
      />

      <textarea
        value={data.prompt}
        onChange={(e) => updateNodeData(nodeId, { prompt: e.target.value })}
        placeholder={tt.canvas_video_placeholder || 'Describe the video...'}
        rows={3}
        className="w-full px-2.5 py-2 text-xs bg-zinc-800 border border-white/10 rounded-md text-zinc-300 placeholder:text-zinc-600 resize-none focus:outline-none focus:border-purple-500/40"
      />

      <div className="flex flex-wrap items-center gap-2">
        {data.model === 'seedance2.5' && (
          <SmartDurationToggle
            checked={data.duration === -1}
            onChange={(checked) => updateNodeData(nodeId, { duration: checked ? -1 : 10 })}
            label="智能时长"
          />
        )}
        <select
          value={data.duration === -1 ? 10 : data.duration}
          onChange={(e) => updateNodeData(nodeId, { duration: Number(e.target.value) })}
          disabled={data.duration === -1}
          className="px-2 py-1 text-[11px] bg-zinc-800 border border-white/10 rounded text-zinc-300 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          {DURATION_OPTIONS.map((d) => <option key={d} value={d}>{d}s</option>)}
        </select>
        <select
          value={data.aspectRatio}
          onChange={(e) => updateNodeData(nodeId, { aspectRatio: e.target.value as VideoNodeData['aspectRatio'] })}
          className="px-2 py-1 text-[11px] bg-zinc-800 border border-white/10 rounded text-zinc-300 focus:outline-none"
        >
          {RATIO_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>

        <div className="flex-1" />

        <CostBadge kind="video" model={data.model} durationSec={data.duration} />
        <button
          type="button"
          onClick={onGenerate}
          disabled={!canGenerate}
          className="ml-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Play className="w-3.5 h-3.5" />
          {tt.canvas_btn_generate || 'Generate'}
        </button>
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// Text panel — script generation
// ---------------------------------------------------------------------------

interface TextPanelBodyProps {
  node: CanvasNode;
  data: TextNodeData;
  isRunning: boolean;
  onGenerate: (cfg: {
    withShots: boolean;
    style: string;
    shotCount: number;
    duration: number;
    aspectRatio: VideoNodeData['aspectRatio'];
  }) => void;
}

const TextPanelBody: React.FC<TextPanelBodyProps> = ({ data, isRunning, onGenerate }) => {
  const { t } = useLanguage();
  const tt = t as Record<string, string | undefined>;
  const [withShots, setWithShots] = React.useState(true);
  const [style, setStyle] = React.useState('realistic');
  const [shotCount, setShotCount] = React.useState(5);
  const [duration, setDuration] = React.useState(10);
  const [aspectRatio, setAspectRatio] = React.useState<VideoNodeData['aspectRatio']>('9:16');

  const canGenerate = !isRunning && (data.content || '').trim().length > 0;

  return (
    <>
      <div className="flex gap-1.5">
        <ScriptKindChip
          active={!withShots}
          label={tt.canvas_panel_script_master || 'Master script only'}
          onClick={() => setWithShots(false)}
        />
        <ScriptKindChip
          active={withShots}
          label={tt.canvas_panel_script_full || 'Master + shots'}
          onClick={() => setWithShots(true)}
        />
      </div>

      <div className="rounded-md bg-zinc-800/40 border border-white/5 p-2 text-[11px] text-zinc-400 italic">
        {tt.canvas_panel_text_uses_content
          || 'The text node\'s current content is used as the script\'s user input. Edit the node body to change it.'}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={style}
          onChange={(e) => setStyle(e.target.value)}
          placeholder={tt.canvas_panel_style_ph || 'Style (e.g. realistic)'}
          className="px-2 py-1 text-[11px] bg-zinc-800 border border-white/10 rounded text-zinc-300 focus:outline-none w-32"
        />
        {withShots && (
          <select
            value={shotCount}
            onChange={(e) => setShotCount(Number(e.target.value))}
            className="px-2 py-1 text-[11px] bg-zinc-800 border border-white/10 rounded text-zinc-300 focus:outline-none"
            title={tt.canvas_panel_shot_count || 'Shot count'}
          >
            {[3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>{n} {tt.canvas_panel_shots || 'shots'}</option>
            ))}
          </select>
        )}
        <select
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          className="px-2 py-1 text-[11px] bg-zinc-800 border border-white/10 rounded text-zinc-300 focus:outline-none"
        >
          {[5, 10, 15, 20, 30].map((d) => (
            <option key={d} value={d}>{d}s</option>
          ))}
        </select>
        <select
          value={aspectRatio}
          onChange={(e) => setAspectRatio(e.target.value as VideoNodeData['aspectRatio'])}
          className="px-2 py-1 text-[11px] bg-zinc-800 border border-white/10 rounded text-zinc-300 focus:outline-none"
        >
          {RATIO_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => onGenerate({ withShots, style, shotCount, duration, aspectRatio })}
          disabled={!canGenerate}
          className="ml-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-orange-600 hover:bg-orange-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Wand2 className="w-3.5 h-3.5" />
          {tt.canvas_btn_generate || 'Generate'}
        </button>
      </div>
    </>
  );
};

function ScriptKindChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 text-[11px] rounded-md border transition-colors ${
        active
          ? 'border-orange-500/70 bg-orange-500/15 text-orange-200'
          : 'border-white/10 bg-zinc-800/60 text-zinc-400 hover:border-white/25 hover:text-zinc-200'
      }`}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Generic 2-3 chip segmented picker
// ---------------------------------------------------------------------------

interface SegPickerProps {
  value: string;
  options: { value: string; label: string }[];
  onChange: (next: string) => void;
}

const SegPicker: React.FC<SegPickerProps> = ({ value, options, onChange }) => {
  return (
    <div className="flex">
      {options.map((opt, idx) => {
        const active = value === opt.value;
        const isFirst = idx === 0;
        const isLast = idx === options.length - 1;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`px-2 py-1 text-[11px] border transition-colors ${
              active
                ? 'border-blue-500/70 bg-blue-500/15 text-blue-200 z-10'
                : 'border-white/10 bg-zinc-800/60 text-zinc-400 hover:border-white/25 hover:text-zinc-200'
            } ${isFirst ? 'rounded-l-md' : ''} ${isLast ? 'rounded-r-md' : ''} ${!isFirst ? '-ml-px' : ''}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};
