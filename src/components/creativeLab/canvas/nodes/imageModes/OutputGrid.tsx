/**
 * Compact thumbnail grid shown inside an ImageNode after generation completes.
 * Supports 1~4 outputs. Click → open full-size preview in a lightbox modal.
 */
import React, { useState } from 'react';
import { X, Download } from 'lucide-react';
import type { ImageNodeOutput } from '../../canvasTypes';

interface OutputGridProps {
  outputs: ImageNodeOutput[];
}

export const OutputGrid: React.FC<OutputGridProps> = ({ outputs }) => {
  const [preview, setPreview] = useState<ImageNodeOutput | null>(null);

  if (!outputs || outputs.length === 0) return null;

  const cols = outputs.length === 1 ? 1 : 2;

  return (
    <>
      <div className={`grid gap-1 mt-2 ${cols === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {outputs.slice(0, 4).map((out, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setPreview(out)}
            className="relative aspect-square rounded-md overflow-hidden bg-zinc-800 hover:ring-2 hover:ring-blue-500/40 transition"
          >
            <img
              src={out.imageUrl}
              alt={`output-${idx}`}
              className="w-full h-full object-cover"
            />
          </button>
        ))}
      </div>

      {preview && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setPreview(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img
              src={preview.imageUrl}
              alt="Preview"
              className="max-w-full max-h-[90vh] rounded-lg shadow-2xl"
            />
            <div className="absolute top-2 right-2 flex gap-1">
              <a
                href={(preview.metadata?.downloadUrl as string) || preview.imageUrl}
                download
                target="_blank"
                rel="noreferrer"
                className="p-2 rounded-full bg-zinc-900/80 hover:bg-zinc-900 text-zinc-200 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <Download className="w-4 h-4" />
              </a>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="p-2 rounded-full bg-zinc-900/80 hover:bg-zinc-900 text-zinc-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
