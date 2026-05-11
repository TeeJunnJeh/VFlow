import React, { useCallback, useRef } from 'react';
import { type NodeProps } from '@xyflow/react';
import { ImageIcon, Upload, X } from 'lucide-react';
import { NodeShell } from './NodeShell';
import { RegenerateButton } from './RegenerateButton';
import { useCanvasStore } from '../canvasStore';
import { useLanguage } from '../../../../context/LanguageContext';
import type { ImageNodeData, CanvasNode } from '../canvasTypes';

export const ImageNode: React.FC<NodeProps<CanvasNode>> = ({ id, data: rawData, selected }) => {
  const data = rawData as ImageNodeData;
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      updateNodeData(id, { imageUrl: url, source: 'upload' } as Partial<ImageNodeData>);
    },
    [id, updateNodeData]
  );

  const onClear = useCallback(() => {
    updateNodeData(id, { imageUrl: null, assetId: null, source: 'upload' } as Partial<ImageNodeData>);
  }, [id, updateNodeData]);

  return (
    <NodeShell
      icon={<ImageIcon className="w-4 h-4" />}
      title={t.canvas_node_image}
      status={data.status}
      color="blue"
      selected={selected}
      hasTarget={data.source === 'generated'}
      error={data.error}
      headerActions={data.source === 'generated' ? <RegenerateButton nodeId={id} status={data.status} /> : undefined}
    >
      {data.imageUrl ? (
        <div className="relative group">
          <img
            src={data.imageUrl}
            alt="Asset"
            className="w-full h-36 object-cover rounded-md border border-white/5"
          />
          <button
            onClick={onClear}
            className="absolute top-1 right-1 p-1 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X className="w-3 h-3 text-white" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full h-28 border-2 border-dashed border-white/10 rounded-md flex flex-col items-center justify-center gap-2 hover:border-blue-500/40 hover:bg-blue-500/5 transition-colors"
        >
          <Upload className="w-5 h-5 text-zinc-500" />
          <span className="text-[11px] text-zinc-500">{t.canvas_upload_click}</span>
        </button>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileSelect}
      />
    </NodeShell>
  );
};
