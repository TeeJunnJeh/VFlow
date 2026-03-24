import React from 'react';
import { FileText, ImageIcon, Video, Save, Trash2, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { useReactFlow } from '@xyflow/react';
import { useCanvasStore } from '../canvasStore';
import { useLanguage } from '../../../context/LanguageContext';
import type { TextNodeData, ImageNodeData, VideoNodeData, CanvasNode } from '../canvasTypes';

let nodeIdCounter = 0;
function nextId() {
  return `node_${Date.now()}_${++nodeIdCounter}`;
}

interface CanvasToolbarProps {
  onSave: () => void;
  isSaving: boolean;
}

export const CanvasToolbar: React.FC<CanvasToolbarProps> = ({ onSave, isSaving }) => {
  const addNode = useCanvasStore((s) => s.addNode);
  const clear = useCanvasStore((s) => s.clear);
  const isDirty = useCanvasStore((s) => s.isDirty);
  const { zoomIn, zoomOut, fitView, getViewport } = useReactFlow();
  const { t } = useLanguage();

  const getCenter = () => {
    const vp = getViewport();
    return {
      x: (-vp.x + 400) / vp.zoom,
      y: (-vp.y + 300) / vp.zoom,
    };
  };

  const addTextNode = () => {
    const pos = getCenter();
    const data: TextNodeData = {
      kind: 'text',
      label: 'Text',
      status: 'idle',
      content: '',
      role: 'prompt',
    };
    addNode({ id: nextId(), type: 'text', position: pos, data } as CanvasNode);
  };

  const addImageNode = () => {
    const pos = getCenter();
    const data: ImageNodeData = {
      kind: 'image',
      label: 'Image',
      status: 'idle',
      imageUrl: null,
      assetId: null,
      source: 'upload',
    };
    addNode({ id: nextId(), type: 'image', position: pos, data } as CanvasNode);
  };

  const addVideoNode = () => {
    const pos = getCenter();
    const data: VideoNodeData = {
      kind: 'video',
      label: 'Video',
      status: 'idle',
      videoUrl: null,
      thumbnailUrl: null,
      taskId: null,
      projectId: null,
      prompt: '',
      model: 'kling',
      duration: 5,
      aspectRatio: '9:16',
    };
    addNode({ id: nextId(), type: 'video', position: pos, data } as CanvasNode);
  };

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-zinc-900/90 backdrop-blur-md border border-white/10 rounded-xl px-2 py-1.5 shadow-xl">
      {/* Add nodes */}
      <div className="flex items-center gap-0.5 pr-2 border-r border-white/10">
        <ToolbarBtn icon={<FileText className="w-4 h-4" />} label={t.canvas_node_text} onClick={addTextNode} color="text-orange-400" />
        <ToolbarBtn icon={<ImageIcon className="w-4 h-4" />} label={t.canvas_node_image} onClick={addImageNode} color="text-blue-400" />
        <ToolbarBtn icon={<Video className="w-4 h-4" />} label={t.canvas_node_video} onClick={addVideoNode} color="text-purple-400" />
      </div>

      {/* Zoom */}
      <div className="flex items-center gap-0.5 px-2 border-r border-white/10">
        <ToolbarBtn icon={<ZoomIn className="w-4 h-4" />} onClick={() => zoomIn()} />
        <ToolbarBtn icon={<ZoomOut className="w-4 h-4" />} onClick={() => zoomOut()} />
        <ToolbarBtn icon={<Maximize className="w-4 h-4" />} onClick={() => fitView({ padding: 0.2 })} />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5 pl-2">
        <ToolbarBtn
          icon={<Save className="w-4 h-4" />}
          label={isSaving ? t.canvas_btn_saving : isDirty ? t.canvas_btn_save_dirty : t.canvas_btn_saved}
          onClick={onSave}
          disabled={isSaving}
        />
        <ToolbarBtn icon={<Trash2 className="w-4 h-4" />} label={t.canvas_btn_clear} onClick={clear} color="text-red-400" />
      </div>
    </div>
  );
};

function ToolbarBtn({
  icon,
  label,
  onClick,
  color = 'text-zinc-400',
  disabled,
}: {
  icon: React.ReactNode;
  label?: string;
  onClick: () => void;
  color?: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs hover:bg-white/5 transition-colors disabled:opacity-40 ${color}`}
    >
      {icon}
      {label && <span className="hidden sm:inline">{label}</span>}
    </button>
  );
}
