import React, { useCallback } from 'react';
import { type NodeProps } from '@xyflow/react';
import { FileText } from 'lucide-react';
import { NodeShell } from './NodeShell';
import { useCanvasStore } from '../canvasStore';
import { useLanguage } from '../../../../context/LanguageContext';
import type { TextNodeData, CanvasNode } from '../canvasTypes';

export const TextNode: React.FC<NodeProps<CanvasNode>> = ({ id, data: rawData, selected }) => {
  const data = rawData as TextNodeData;
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const { t } = useLanguage();

  const ROLE_LABELS: Record<TextNodeData['role'], string> = {
    prompt: t.canvas_role_prompt,
    note: t.canvas_role_note,
    product_info: t.canvas_role_product_info,
  };

  const onContentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateNodeData(id, { content: e.target.value });
    },
    [id, updateNodeData]
  );

  const onRoleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateNodeData(id, { role: e.target.value as TextNodeData['role'] });
    },
    [id, updateNodeData]
  );

  return (
    <NodeShell
      icon={<FileText className="w-4 h-4" />}
      title={t.canvas_node_text}
      status={data.status}
      color="orange"
      selected={selected}
      hasTarget={false}
      error={data.error}
    >
      <select
        value={data.role}
        onChange={onRoleChange}
        className="w-full mb-2 px-2 py-1 text-xs bg-zinc-800 border border-white/10 rounded-md text-zinc-300 focus:outline-none focus:border-orange-500/50"
      >
        {Object.entries(ROLE_LABELS).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
      <textarea
        value={data.content}
        onChange={onContentChange}
        placeholder={t.canvas_text_placeholder}
        rows={3}
        className="w-full px-2 py-1.5 text-xs bg-zinc-800 border border-white/10 rounded-md text-zinc-300 resize-none focus:outline-none focus:border-orange-500/50 custom-scroll"
      />
    </NodeShell>
  );
};
