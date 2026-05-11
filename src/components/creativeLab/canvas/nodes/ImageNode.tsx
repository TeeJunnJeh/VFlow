/**
 * Unified ImageNode — one canvas node that can produce an image through 5
 * different mode-paths (upload / first_frame / smart_repair / clothing_swap /
 * ai_model). The active `data.mode` selects which sub-component renders inside
 * the NodeShell. Outputs (one or many) are shown by `<OutputGrid>` below the
 * mode-specific body and are persisted on the node via `outputs` + `imageUrl`.
 *
 * Backward compat: legacy ImageNodes without `mode` render as `upload`.
 */
import React, { useCallback, useEffect, useMemo } from 'react';
import { type NodeProps } from '@xyflow/react';
import { ImageIcon } from 'lucide-react';
import { NodeShell } from './NodeShell';
import { RegenerateButton } from './RegenerateButton';
import { useCanvasStore } from '../canvasStore';
import { useLanguage } from '../../../../context/LanguageContext';
import type { ImageNodeData, CanvasNode, ImageNodeMode } from '../canvasTypes';
import { ImageModeChips } from './imageModes/ImageModeChips';
import { OutputGrid } from './imageModes/OutputGrid';
import { UploadMode } from './imageModes/UploadMode';
import { FirstFrameMode } from './imageModes/FirstFrameMode';
import { SmartRepairMode } from './imageModes/SmartRepairMode';
import { ClothingSwapMode } from './imageModes/ClothingSwapMode';
import { AIModelMode } from './imageModes/AIModelMode';
import { runGeneration, hydratePending } from './imageModes/imageGenHandlers';

export const ImageNode: React.FC<NodeProps<CanvasNode>> = ({ id, data: rawData, selected }) => {
  const data = rawData as ImageNodeData;
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const { t } = useLanguage();

  const mode: ImageNodeMode = data.mode || 'upload';

  // Resume polling for any pending requests on mount (refresh / view-switch
  // recovery). The handler reads pendingRequestIds and re-fires per-mode pollers.
  useEffect(() => {
    if (data.pendingRequestIds && data.pendingRequestIds.length > 0 && data.status === 'running') {
      hydratePending(id, data, { updateNodeData });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleGenerate = useCallback(() => {
    void runGeneration(id, data, { updateNodeData });
  }, [id, data, updateNodeData]);

  const outputs = useMemo(() => data.outputs || [], [data.outputs]);

  // Upload mode is the only one with `hasTarget=false` (it's a pure source).
  // All generation modes accept upstream edges (so upstream Text/Image nodes
  // can feed prompts/refs via future P0-4 auto-fill).
  const hasTarget = mode !== 'upload';
  const showRegen = data.source === 'generated' && mode !== 'upload';

  return (
    <NodeShell
      icon={<ImageIcon className="w-4 h-4" />}
      title={t.canvas_node_image}
      status={data.status}
      color="blue"
      selected={selected}
      hasTarget={hasTarget}
      error={data.error}
      headerActions={showRegen ? <RegenerateButton nodeId={id} status={data.status} /> : undefined}
    >
      <div className="min-w-[260px] max-w-[320px]">
        {/* Mode switcher */}
        <ImageModeChips
          value={mode}
          onChange={(next) => updateNodeData(id, { mode: next })}
        />

        {/* Mode-specific body */}
        {mode === 'upload' && (
          <UploadMode id={id} data={data} updateNodeData={updateNodeData} />
        )}
        {mode === 'first_frame' && (
          <FirstFrameMode id={id} data={data} updateNodeData={updateNodeData} onGenerate={handleGenerate} />
        )}
        {mode === 'smart_repair' && (
          <SmartRepairMode id={id} data={data} updateNodeData={updateNodeData} onGenerate={handleGenerate} />
        )}
        {mode === 'clothing_swap' && (
          <ClothingSwapMode id={id} data={data} updateNodeData={updateNodeData} onGenerate={handleGenerate} />
        )}
        {mode === 'ai_model' && (
          <AIModelMode id={id} data={data} updateNodeData={updateNodeData} onGenerate={handleGenerate} />
        )}

        {/* Shared output grid */}
        {outputs.length > 0 && <OutputGrid outputs={outputs} />}
      </div>
    </NodeShell>
  );
};
