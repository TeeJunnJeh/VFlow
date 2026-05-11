/**
 * SmartRepairMode — repair / restyle a single source image with a prompt.
 * Async link: submit → poll request_id → fill outputs.
 */
import React, { useCallback, useRef } from 'react';
import { Upload, X, Play, Loader2 } from 'lucide-react';
import { useLanguage } from '../../../../../context/LanguageContext';
import { CanvasModelChips, type CanvasModelChipOption } from '../../panels/CanvasModelChips';
import type { ImageNodeData } from '../../canvasTypes';
import { SlotLibraryButton } from './SlotLibraryButton';
import { CostBadge } from './CostBadge';

const MODEL_OPTIONS: CanvasModelChipOption[] = [
  { value: 'nano-banana-pro', label: 'NanoBanana Pro', color: 'blue' },
  { value: 'flux-2-pro', label: 'Flux 2 Pro', color: 'blue' },
  { value: 'gpt-image-1.5', label: 'GPT image 1.5', color: 'blue' },
];

interface SmartRepairModeProps {
  id: string;
  data: ImageNodeData;
  updateNodeData: (id: string, partial: Partial<ImageNodeData>) => void;
  onGenerate: () => void;
}

export const SmartRepairMode: React.FC<SmartRepairModeProps> = ({ id, data, updateNodeData, onGenerate }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useLanguage();
  const tt = t as Record<string, string | undefined>;
  const isRunning = data.status === 'running';
  const sourceUrl = data.smartRepairSourceUrl || null;
  const STRENGTH_OPTIONS = [
    { value: 'light', label: tt.canvas_strength_light || 'Light' },
    { value: 'medium', label: tt.canvas_strength_medium || 'Medium' },
    { value: 'strong', label: tt.canvas_strength_strong || 'Strong' },
  ];

  const onPickSource = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = '';
      const url = URL.createObjectURL(file);
      updateNodeData(id, { smartRepairSourceUrl: url });
    },
    [id, updateNodeData],
  );

  const onClearSource = useCallback(() => {
    updateNodeData(id, { smartRepairSourceUrl: null });
  }, [id, updateNodeData]);

  const strength = data.smartRepairStrength || 'medium';

  return (
    <div className="space-y-2">
      {/* Source image */}
      {sourceUrl ? (
        <div className="relative group w-full">
          <img src={sourceUrl} alt="Source" className="w-full h-28 object-cover rounded-md border border-white/5" />
          <button
            type="button"
            onClick={onClearSource}
            className="absolute top-1 right-1 p-1 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X className="w-3 h-3 text-white" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full h-20 rounded-md border-2 border-dashed border-white/10 flex flex-col items-center justify-center gap-1 hover:border-blue-500/40 hover:bg-blue-500/5"
          >
            <Upload className="w-4 h-4 text-zinc-500" />
            <span className="text-[10px] text-zinc-500">{tt.canvas_btn_upload_source || 'Click to upload source'}</span>
          </button>
          <SlotLibraryButton
            kind="product"
            title={tt.canvas_btn_pick_from_library || 'Pick from library'}
            onPick={(url) => updateNodeData(id, { smartRepairSourceUrl: url })}
          />
        </div>
      )}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onPickSource} />

      {/* Model chip */}
      <CanvasModelChips
        value={data.smartRepairModel || 'flux-2-pro'}
        onChange={(next) => updateNodeData(id, { smartRepairModel: next as ImageNodeData['smartRepairModel'] })}
        options={MODEL_OPTIONS}
        size="xs"
      />

      {/* Prompt */}
      <textarea
        value={data.smartRepairPrompt || ''}
        onChange={(e) => updateNodeData(id, { smartRepairPrompt: e.target.value })}
        placeholder={tt.canvas_ph_smart_repair || 'Repair instructions...'}
        rows={2}
        className="w-full px-2 py-1.5 text-xs bg-zinc-800 border border-white/10 rounded text-zinc-300 resize-none focus:outline-none focus:border-blue-500/50"
      />

      {/* Strength */}
      <div className="flex gap-1">
        {STRENGTH_OPTIONS.map((opt) => {
          const active = strength === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => updateNodeData(id, { smartRepairStrength: opt.value as ImageNodeData['smartRepairStrength'] })}
              className={`flex-1 px-2 py-1 text-[10px] rounded-md border transition-colors ${
                active
                  ? 'border-blue-500/70 bg-blue-500/10 text-blue-200'
                  : 'border-white/10 bg-zinc-800/60 text-zinc-400 hover:border-white/25 hover:text-zinc-200'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Output count + Generate + cost preview */}
      <div className="flex items-center gap-2">
        <select
          value={data.outputCount || 1}
          onChange={(e) => updateNodeData(id, { outputCount: Number(e.target.value) as 1 | 2 | 3 | 4 })}
          className="px-1.5 py-1 text-[11px] bg-zinc-800 border border-white/10 rounded text-zinc-300 focus:outline-none"
        >
          {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}×</option>)}
        </select>
        <button
          type="button"
          disabled={isRunning || !sourceUrl || !(data.smartRepairPrompt || '').trim()}
          onClick={onGenerate}
          className="flex-1 py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-500 text-white"
        >
          {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
          {tt.canvas_btn_generate || 'Generate'}
        </button>
      </div>
      <div className="flex justify-end -mt-1">
        <CostBadge
          kind="image"
          model={data.smartRepairModel || 'flux-2-pro'}
          outputCount={data.outputCount || 1}
        />
      </div>
    </div>
  );
};
