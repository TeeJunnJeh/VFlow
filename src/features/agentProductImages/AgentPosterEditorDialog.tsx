import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import TextSeparationDemoView from '../../components/workbench/TextSeparationDemoView';
import type { AgentPosterEditorData } from './posterEditorData';

export const AgentPosterEditorDialog: React.FC<{
  data: AgentPosterEditorData;
  isZh: boolean;
  onClose: () => void;
}> = ({ data, isZh, onClose }) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[500] overflow-hidden bg-zinc-950 p-3 text-zinc-100 sm:p-5">
      <TextSeparationDemoView
        backgroundImageUrl={data.clean_image_url}
        originalImageUrl={data.original_image_url}
        sampleTitle={data.sample_title}
        textBlocks={data.text_blocks}
        isZh={isZh}
        onBack={onClose}
      />
    </div>,
    document.body,
  );
};
