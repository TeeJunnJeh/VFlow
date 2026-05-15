/**
 * FirstFrameMode — generate a product first-frame image from 1+ reference
 * product images + prompt + model chip. Reference images are uploaded directly
 * inside the node (small uploader slots); the upstream edge auto-fill story
 * is handled by CanvasEditor.
 */
import React, { useCallback, useRef } from 'react';
import { Upload, X, Play, Loader2 } from 'lucide-react';
import { useLanguage } from '../../../../../context/LanguageContext';
import { CanvasModelChips, type CanvasModelChipOption } from '../../panels/CanvasModelChips';
import type { ImageNodeData } from '../../canvasTypes';
import { SlotLibraryButton } from './SlotLibraryButton';
import { CostBadge } from './CostBadge';

const FIRST_FRAME_MODEL_OPTIONS: CanvasModelChipOption[] = [
  { value: 'nano-banana-pro', label: 'NanoBanana Pro', color: 'blue' },
  { value: 'flux-2-pro', label: 'Flux 2 Pro', color: 'blue' },
  { value: 'gpt-image-1.5', label: 'GPT image 1.5', color: 'blue' },
];

interface FirstFrameModeProps {
  id: string;
  data: ImageNodeData;
  updateNodeData: (id: string, partial: Partial<ImageNodeData>) => void;
  onGenerate: () => void;
}

export const FirstFrameMode: React.FC<FirstFrameModeProps> = ({ id, data, updateNodeData, onGenerate }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useLanguage();
  const tt = t as Record<string, string | undefined>;
  const isRunning = data.status === 'running';
  const refs = data.firstFrameReferenceUrls || [];

  const addRef = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = '';
      const url = URL.createObjectURL(file);
      updateNodeData(id, { firstFrameReferenceUrls: [...refs, url] });
    },
    [id, refs, updateNodeData],
  );

  const removeRef = useCallback(
    (idx: number) => {
      const next = [...refs];
      next.splice(idx, 1);
      updateNodeData(id, { firstFrameReferenceUrls: next });
    },
    [id, refs, updateNodeData],
  );

  return (
    <div className="space-y-2">
      {/* References row */}
      <div className="flex gap-1 flex-wrap items-start">
        {refs.map((url, idx) => (
          <div key={idx} className="relative group w-14 h-14 rounded-md overflow-hidden bg-zinc-800 border border-white/5">
            <img src={url} alt={`ref-${idx}`} className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => removeRef(idx)}
              className="absolute top-0 right-0 p-0.5 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-3 h-3 text-white" />
            </button>
          </div>
        ))}
        {refs.length < 4 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-14 h-14 rounded-md border-2 border-dashed border-white/15 flex items-center justify-center hover:border-blue-500/40 hover:bg-blue-500/5"
              title={tt.canvas_btn_add_reference || 'Add reference'}
            >
              <Upload className="w-4 h-4 text-zinc-500" />
            </button>
            <SlotLibraryButton
              kind="product"
              title={tt.canvas_btn_pick_from_library || 'Pick from library'}
              multiple
              onPickMany={(urls) => {
                const room = Math.max(0, 4 - refs.length);
                const additions = urls.slice(0, room);
                if (additions.length > 0) {
                  updateNodeData(id, { firstFrameReferenceUrls: [...refs, ...additions] });
                }
              }}
            />
          </div>
        )}
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={addRef} />

      {/* Model */}
      <CanvasModelChips
        value={data.firstFrameModel || 'nano-banana-pro'}
        onChange={(next) => updateNodeData(id, { firstFrameModel: next as ImageNodeData['firstFrameModel'] })}
        options={FIRST_FRAME_MODEL_OPTIONS}
        size="xs"
      />

      {/* Prompt */}
      <textarea
        value={data.firstFramePrompt || ''}
        onChange={(e) => updateNodeData(id, { firstFramePrompt: e.target.value })}
        placeholder={tt.canvas_ph_first_frame || 'Describe the first frame...'}
        rows={2}
        className="w-full px-2 py-1.5 text-xs bg-zinc-800 border border-white/10 rounded text-zinc-300 resize-none focus:outline-none focus:border-blue-500/50"
      />

      {/* Output count + Generate + cost preview */}
      <div className="flex items-center gap-2">
        <select
          value={data.firstFrameResolution || '1k'}
          onChange={(e) => {
            const next = e.target.value === '2k' || e.target.value === '4k' ? e.target.value : '1k';
            updateNodeData(id, { firstFrameResolution: next });
          }}
          className="px-1.5 py-1 text-[11px] bg-zinc-800 border border-white/10 rounded text-zinc-300 focus:outline-none"
          title={tt.pg_main_resolution || 'Resolution'}
        >
          {['1k', '2k', '4k'].map((value) => (
            <option key={value} value={value}>{value.toUpperCase()}</option>
          ))}
        </select>
        <select
          value={data.outputCount || 1}
          onChange={(e) => updateNodeData(id, { outputCount: Number(e.target.value) as 1 | 2 | 3 | 4 })}
          className="px-1.5 py-1 text-[11px] bg-zinc-800 border border-white/10 rounded text-zinc-300 focus:outline-none"
        >
          {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}×</option>)}
        </select>
        <button
          type="button"
          disabled={isRunning || refs.length === 0 || !(data.firstFramePrompt || '').trim()}
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
          model={data.firstFrameModel || 'nano-banana-pro'}
          outputCount={data.outputCount || 1}
        />
      </div>
    </div>
  );
};
