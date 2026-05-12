/**
 * ImageNode — slim "image slot" node. All generation configuration (mode,
 * prompt, model, strength, output count, etc.) has moved to the global
 * `BottomInputPanel` that opens when the user clicks the node. The node body
 * is now purely a display surface:
 *   - Empty state: dashed placeholder telling the user to click + configure
 *   - Filled state: imageUrl preview, or OutputGrid when multiple outputs
 *
 * Configuration fields on `ImageNodeData` (mode / firstFramePrompt /
 * smartRepairPrompt / ... / outputCount) are preserved so the panel can read
 * + write them; `imageGenHandlers.runGeneration()` still drives the per-mode
 * API calls — the only difference is the form UI lives in BottomInputPanel
 * instead of inline mode subcomponents.
 *
 * Backward compat: legacy ImageNodes with already-set imageUrl render their
 * image directly. Old data with `mode: 'upload'` no longer triggers an inline
 * uploader — users must wire an UploadResourceNode upstream OR generate.
 */
import React, { useEffect, useMemo } from 'react';
import { type NodeProps } from '@xyflow/react';
import { ImageIcon } from 'lucide-react';
import { NodeShell } from './NodeShell';
import { RegenerateButton } from './RegenerateButton';
import { InputToggle } from './InputToggle';
import { useCanvasStore } from '../canvasStore';
import { useLanguage } from '../../../../context/LanguageContext';
import type { ImageNodeData, CanvasNode } from '../canvasTypes';
import { OutputGrid } from './imageModes/OutputGrid';
import { hydratePending } from './imageModes/imageGenHandlers';

export const ImageNode: React.FC<NodeProps<CanvasNode>> = ({ id, data: rawData, selected }) => {
  const data = rawData as ImageNodeData;
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const { t } = useLanguage();
  const tt = t as Record<string, string | undefined>;
  const useAsInput = data.useAsInput !== false;

  // Resume polling for any pending requests on mount (refresh / view-switch
  // recovery). Driven by `pendingRequestIds` that BottomInputPanel populates
  // when a generation is in-flight.
  useEffect(() => {
    if (data.pendingRequestIds && data.pendingRequestIds.length > 0 && data.status === 'running') {
      hydratePending(id, data, { updateNodeData });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const outputs = useMemo(() => data.outputs || [], [data.outputs]);
  const hasImage = Boolean(data.imageUrl) || outputs.length > 0;
  const showRegen = data.source === 'generated';

  return (
    <NodeShell
      icon={<ImageIcon className="w-4 h-4" />}
      title={t.canvas_node_image}
      status={data.status}
      color="blue"
      selected={selected}
      hasTarget
      error={data.error}
      headerActions={
        <div className="flex items-center gap-1">
          <InputToggle
            active={useAsInput}
            onChange={(next) => updateNodeData(id, { useAsInput: next })}
          />
          {showRegen && <RegenerateButton nodeId={id} status={data.status} />}
        </div>
      }
    >
      <div className="min-w-[240px] max-w-[300px] space-y-2">
        {outputs.length > 1 ? (
          <OutputGrid outputs={outputs} />
        ) : data.imageUrl ? (
          <img
            src={data.imageUrl}
            alt="output"
            className="w-full max-h-44 object-cover rounded-md border border-white/5 bg-zinc-900"
          />
        ) : (
          <div className="h-28 rounded-md border-2 border-dashed border-blue-500/30 bg-blue-500/5 flex items-center justify-center px-3 text-center">
            <div className="text-[11px] text-zinc-400 leading-snug">
              {tt.canvas_image_placeholder_hint
                || 'Connect an Upload/Image upstream and click this node to configure & generate.'}
            </div>
          </div>
        )}

        {/* Optional caption used when this image is collected as upstream input. */}
        {useAsInput && hasImage && (
          <input
            type="text"
            value={data.inputCaption || ''}
            onChange={(e) => updateNodeData(id, { inputCaption: e.target.value })}
            placeholder={tt.canvas_image_caption_placeholder || 'Caption for downstream (optional)'}
            className="w-full px-2 py-1 text-[11px] bg-zinc-800 border border-white/10 rounded text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/40"
          />
        )}
      </div>
    </NodeShell>
  );
};
