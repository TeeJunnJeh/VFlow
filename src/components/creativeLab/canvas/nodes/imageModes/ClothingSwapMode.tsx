/**
 * ClothingSwapMode — 2 image slots (model + garment) + category + output count.
 * Sync call: one round trip yields all outputs at once.
 */
import React, { useCallback, useRef } from 'react';
import { Upload, X, Play, Loader2 } from 'lucide-react';
import { useLanguage } from '../../../../../context/LanguageContext';
import type { ImageNodeData } from '../../canvasTypes';
import { SlotLibraryButton } from './SlotLibraryButton';
import { CostBadge } from './CostBadge';
import type { CreativeAssetPickerKind } from '../../../CreativeAssetPickerDialog';

interface ClothingSwapModeProps {
  id: string;
  data: ImageNodeData;
  updateNodeData: (id: string, partial: Partial<ImageNodeData>) => void;
  onGenerate: () => void;
}

export const ClothingSwapMode: React.FC<ClothingSwapModeProps> = ({ id, data, updateNodeData, onGenerate }) => {
  const modelInputRef = useRef<HTMLInputElement>(null);
  const garmentInputRef = useRef<HTMLInputElement>(null);
  const { t } = useLanguage();
  const tt = t as Record<string, string | undefined>;
  const isRunning = data.status === 'running';
  const CATEGORIES = [
    { value: 'top', label: tt.canvas_cs_top || 'Top' },
    { value: 'bottom', label: tt.canvas_cs_bottom || 'Bottom' },
    { value: 'full_body', label: tt.canvas_cs_full_body || 'Full Body' },
  ];

  const onPickModel = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = '';
      updateNodeData(id, { clothingSwapModelUrl: URL.createObjectURL(file) });
    },
    [id, updateNodeData],
  );

  const onPickGarment = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = '';
      updateNodeData(id, { clothingSwapGarmentUrl: URL.createObjectURL(file) });
    },
    [id, updateNodeData],
  );

  const category = data.clothingSwapCategory || 'top';

  const renderSlot = (
    label: string,
    url: string | null | undefined,
    onClick: () => void,
    onClear: () => void,
    libraryKind: CreativeAssetPickerKind,
    onPickFromLibrary: (url: string) => void,
  ) => (
    <div className="flex-1">
      <div className="text-[10px] text-zinc-500 mb-1">{label}</div>
      {url ? (
        <div className="relative group aspect-square rounded-md overflow-hidden bg-zinc-800 border border-white/5">
          <img src={url} alt={label} className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={onClear}
            className="absolute top-1 right-1 p-1 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X className="w-3 h-3 text-white" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <button
            type="button"
            onClick={onClick}
            className="w-full aspect-square rounded-md border-2 border-dashed border-white/10 flex items-center justify-center hover:border-blue-500/40 hover:bg-blue-500/5"
          >
            <Upload className="w-4 h-4 text-zinc-500" />
          </button>
          <SlotLibraryButton
            kind={libraryKind}
            title={tt.canvas_btn_pick_from_library || 'Pick from library'}
            onPick={onPickFromLibrary}
          />
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {renderSlot(
          tt.canvas_slot_model_image || 'Model',
          data.clothingSwapModelUrl,
          () => modelInputRef.current?.click(),
          () => updateNodeData(id, { clothingSwapModelUrl: null }),
          'model',
          (url) => updateNodeData(id, { clothingSwapModelUrl: url }),
        )}
        {renderSlot(
          tt.canvas_slot_garment_image || 'Garment',
          data.clothingSwapGarmentUrl,
          () => garmentInputRef.current?.click(),
          () => updateNodeData(id, { clothingSwapGarmentUrl: null }),
          'product',
          (url) => updateNodeData(id, { clothingSwapGarmentUrl: url }),
        )}
      </div>
      <input ref={modelInputRef} type="file" accept="image/*" className="hidden" onChange={onPickModel} />
      <input ref={garmentInputRef} type="file" accept="image/*" className="hidden" onChange={onPickGarment} />

      {/* Category chip row */}
      <div className="flex gap-1">
        {CATEGORIES.map((opt) => {
          const active = category === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => updateNodeData(id, { clothingSwapCategory: opt.value as ImageNodeData['clothingSwapCategory'] })}
              className={`flex-1 px-1.5 py-1 text-[10px] rounded-md border transition-colors ${
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
          disabled={isRunning || !data.clothingSwapModelUrl || !data.clothingSwapGarmentUrl}
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
          model="clothing-swap"
          outputCount={data.outputCount || 1}
        />
      </div>
    </div>
  );
};
