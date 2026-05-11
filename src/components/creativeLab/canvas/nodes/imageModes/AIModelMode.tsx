/**
 * AIModelMode — virtual OR real-person model generation.
 * Virtual: prompt + gender + style. Real: image + brief.
 */
import React, { useCallback, useRef } from 'react';
import { Upload, X, Play, Loader2 } from 'lucide-react';
import { useLanguage } from '../../../../../context/LanguageContext';
import type { ImageNodeData } from '../../canvasTypes';
import { SlotLibraryButton } from './SlotLibraryButton';

interface AIModelModeProps {
  id: string;
  data: ImageNodeData;
  updateNodeData: (id: string, partial: Partial<ImageNodeData>) => void;
  onGenerate: () => void;
}

export const AIModelMode: React.FC<AIModelModeProps> = ({ id, data, updateNodeData, onGenerate }) => {
  const realInputRef = useRef<HTMLInputElement>(null);
  const { t } = useLanguage();
  const tt = t as Record<string, string | undefined>;
  const isRunning = data.status === 'running';
  const subMode = data.aiModelMode || 'virtual';

  const GENDERS = [
    { value: 'female', label: tt.canvas_gender_f || 'F' },
    { value: 'male', label: tt.canvas_gender_m || 'M' },
    { value: 'no_limit', label: tt.canvas_gender_any || 'Any' },
  ];
  const STYLES = [
    { value: 'commercial', label: tt.canvas_ai_style_commercial || 'Commercial' },
    { value: 'fashion', label: tt.canvas_ai_style_fashion || 'Fashion' },
    { value: 'lifestyle', label: tt.canvas_ai_style_lifestyle || 'Lifestyle' },
  ];

  const onPickReal = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = '';
      updateNodeData(id, { aiModelRealSourceUrl: URL.createObjectURL(file) });
    },
    [id, updateNodeData],
  );

  return (
    <div className="space-y-2">
      {/* Mode toggle */}
      <div className="flex gap-1 p-0.5 bg-zinc-800/50 rounded-md">
        {(['virtual', 'real'] as const).map((m) => {
          const active = subMode === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => updateNodeData(id, { aiModelMode: m })}
              className={`flex-1 px-2 py-1 text-[11px] rounded transition-colors ${
                active ? 'bg-blue-500/20 text-blue-200' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {m === 'virtual' ? (tt.canvas_ai_mode_virtual || 'Virtual') : (tt.canvas_ai_mode_real || 'Real Person')}
            </button>
          );
        })}
      </div>

      {subMode === 'virtual' ? (
        <>
          <textarea
            value={data.aiModelPrompt || ''}
            onChange={(e) => updateNodeData(id, { aiModelPrompt: e.target.value })}
            placeholder={tt.canvas_ph_ai_model_virtual || 'Describe the model (e.g. Asian female, 25, commercial)...'}
            rows={2}
            className="w-full px-2 py-1.5 text-xs bg-zinc-800 border border-white/10 rounded text-zinc-300 resize-none focus:outline-none focus:border-blue-500/50"
          />
          <div>
            <div className="text-[10px] text-zinc-500 mb-1">{tt.canvas_gender_label || 'Gender'}</div>
            <div className="flex gap-1">
              {GENDERS.map((opt) => {
                const active = (data.aiModelGender || 'no_limit') === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateNodeData(id, { aiModelGender: opt.value as ImageNodeData['aiModelGender'] })}
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
          </div>
          <div>
            <div className="text-[10px] text-zinc-500 mb-1">{tt.canvas_style_label || 'Style'}</div>
            <div className="flex gap-1">
              {STYLES.map((opt) => {
                const active = (data.aiModelStyle || 'commercial') === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateNodeData(id, { aiModelStyle: opt.value as ImageNodeData['aiModelStyle'] })}
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
          </div>
        </>
      ) : (
        <>
          {/* Real person image */}
          {data.aiModelRealSourceUrl ? (
            <div className="relative group w-full">
              <img src={data.aiModelRealSourceUrl} alt="Real" className="w-full h-28 object-cover rounded-md border border-white/5" />
              <button
                type="button"
                onClick={() => updateNodeData(id, { aiModelRealSourceUrl: null })}
                className="absolute top-1 right-1 p-1 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <button
                type="button"
                onClick={() => realInputRef.current?.click()}
                className="w-full h-20 rounded-md border-2 border-dashed border-white/10 flex flex-col items-center justify-center gap-1 hover:border-blue-500/40 hover:bg-blue-500/5"
              >
                <Upload className="w-4 h-4 text-zinc-500" />
                <span className="text-[10px] text-zinc-500">{tt.canvas_btn_upload_real_person || 'Click to upload real person'}</span>
              </button>
              <SlotLibraryButton
                kind="model"
                title={tt.canvas_btn_pick_from_library || 'Pick from library'}
                onPick={(url) => updateNodeData(id, { aiModelRealSourceUrl: url })}
              />
            </div>
          )}
          <input ref={realInputRef} type="file" accept="image/*" className="hidden" onChange={onPickReal} />
          <textarea
            value={data.aiModelRealBrief || ''}
            onChange={(e) => updateNodeData(id, { aiModelRealBrief: e.target.value })}
            placeholder={tt.canvas_ph_ai_model_real_brief || 'Edit brief (e.g. business attire, studio bg)...'}
            rows={2}
            className="w-full px-2 py-1.5 text-xs bg-zinc-800 border border-white/10 rounded text-zinc-300 resize-none focus:outline-none focus:border-blue-500/50"
          />
        </>
      )}

      {/* Output count + Generate */}
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
          disabled={
            isRunning
            || (subMode === 'virtual' && !(data.aiModelPrompt || '').trim())
            || (subMode === 'real' && (!data.aiModelRealSourceUrl || !(data.aiModelRealBrief || '').trim()))
          }
          onClick={onGenerate}
          className="flex-1 py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-500 text-white"
        >
          {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
          {tt.canvas_btn_generate || 'Generate'}
        </button>
      </div>
    </div>
  );
};
