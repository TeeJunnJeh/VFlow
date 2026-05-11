/**
 * UploadMode — direct local-file upload. The original ImageNode behavior.
 */
import React, { useCallback, useRef } from 'react';
import { Upload, X } from 'lucide-react';
import { useLanguage } from '../../../../../context/LanguageContext';
import type { ImageNodeData } from '../../canvasTypes';
import { SlotLibraryButton } from './SlotLibraryButton';

interface UploadModeProps {
  id: string;
  data: ImageNodeData;
  updateNodeData: (nodeId: string, partial: Partial<ImageNodeData>) => void;
}

export const UploadMode: React.FC<UploadModeProps> = ({ id, data, updateNodeData }) => {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      updateNodeData(id, { imageUrl: url, source: 'upload' });
    },
    [id, updateNodeData],
  );

  const onClear = useCallback(() => {
    updateNodeData(id, { imageUrl: null, assetId: null, source: 'upload' });
  }, [id, updateNodeData]);

  return (
    <>
      {data.imageUrl ? (
        <div className="relative group">
          <img
            src={data.imageUrl}
            alt="Asset"
            className="w-full h-36 object-cover rounded-md border border-white/5"
          />
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
            onClick={() => fileInputRef.current?.click()}
            className="w-full h-28 border-2 border-dashed border-white/10 rounded-md flex flex-col items-center justify-center gap-2 hover:border-blue-500/40 hover:bg-blue-500/5 transition-colors"
          >
            <Upload className="w-5 h-5 text-zinc-500" />
            <span className="text-[11px] text-zinc-500">{t.canvas_upload_click}</span>
          </button>
          <SlotLibraryButton
            kind="product"
            title={(t as Record<string, string | undefined>).canvas_btn_pick_from_library || 'Pick from library'}
            onPick={(url) => updateNodeData(id, { imageUrl: url, source: 'library' })}
          />
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileSelect}
      />
    </>
  );
};
