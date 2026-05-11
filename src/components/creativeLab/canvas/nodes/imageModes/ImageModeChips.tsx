/**
 * 5-chip mode switcher shown at the top of every ImageNode.
 * Visually distinct from `CanvasModelChips` because it uses icons + tooltips
 * (canvas nodes are tight on horizontal space, so we trade text for icons).
 */
import React from 'react';
import { Upload, ImagePlay, Wand2, Shirt, UserRound } from 'lucide-react';
import { useLanguage } from '../../../../../context/LanguageContext';
import type { ImageNodeMode } from '../../canvasTypes';

interface ImageModeChipsProps {
  value: ImageNodeMode;
  onChange: (next: ImageNodeMode) => void;
}

export const ImageModeChips: React.FC<ImageModeChipsProps> = ({ value, onChange }) => {
  const { t } = useLanguage();
  const tt = t as Record<string, string | undefined>;
  const options: Array<{
    id: ImageNodeMode;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
  }> = [
    { id: 'upload', icon: Upload, label: tt.canvas_image_mode_upload || 'Upload' },
    { id: 'first_frame', icon: ImagePlay, label: tt.canvas_image_mode_first_frame || 'First Frame' },
    { id: 'smart_repair', icon: Wand2, label: tt.canvas_image_mode_smart_repair || 'Smart Repair' },
    { id: 'clothing_swap', icon: Shirt, label: tt.canvas_image_mode_clothing_swap || 'Clothing Swap' },
    { id: 'ai_model', icon: UserRound, label: tt.canvas_image_mode_ai_model || 'AI Model' },
  ];

  return (
    <div className="flex flex-wrap gap-1 mb-2 pb-2 border-b border-white/5">
      {options.map(({ id, icon: Icon, label }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            title={label}
            className={`flex items-center gap-1 px-1.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
              active
                ? 'bg-blue-500/15 text-blue-200 border border-blue-500/40'
                : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/5 border border-transparent'
            }`}
            aria-pressed={active}
          >
            <Icon className="w-3 h-3" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
};
