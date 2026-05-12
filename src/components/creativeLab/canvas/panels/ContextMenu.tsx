import React from 'react';
import { FileText, ImageIcon, Video, Trash2, Copy, Film, ScrollText, Wand2, Upload } from 'lucide-react';
import { useLanguage } from '../../../../context/LanguageContext';

export interface ContextMenuPosition {
  x: number;
  y: number;
}

interface ContextMenuProps {
  position: ContextMenuPosition;
  type: 'pane' | 'node';
  nodeKind?: string;
  onClose: () => void;
  onAddTextNode: () => void;
  onAddImageNode: () => void;
  onAddVideoNode: () => void;
  onAddVideoAnalysisNode?: () => void;
  onAddUploadNode?: () => void;
  onDeleteNode?: () => void;
  onCopyNode?: () => void;
  onGenerateVideo?: () => void;
  onGenerateScript?: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  position,
  type,
  nodeKind,
  onClose,
  onAddTextNode,
  onAddImageNode,
  onAddVideoNode,
  onAddVideoAnalysisNode,
  onAddUploadNode,
  onDeleteNode,
  onCopyNode,
  onGenerateVideo,
  onGenerateScript,
}) => {
  const { t } = useLanguage();
  const tt = t as Record<string, string | undefined>;

  const handleClick = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <>
      {/* Backdrop to catch clicks */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <div
        className="fixed z-50 bg-zinc-900 border border-white/10 rounded-lg shadow-xl shadow-black/40 py-1 min-w-[180px]"
        style={{ left: position.x, top: position.y }}
      >
        {type === 'pane' && (
          <>
            <MenuItem
              icon={<FileText className="w-3.5 h-3.5" />}
              label={t.canvas_menu_add_text}
              onClick={() => handleClick(onAddTextNode)}
            />
            <MenuItem
              icon={<ImageIcon className="w-3.5 h-3.5" />}
              label={t.canvas_menu_add_image}
              onClick={() => handleClick(onAddImageNode)}
            />
            <MenuItem
              icon={<Video className="w-3.5 h-3.5" />}
              label={t.canvas_menu_add_video}
              onClick={() => handleClick(onAddVideoNode)}
            />
            {onAddVideoAnalysisNode && (
              <MenuItem
                icon={<Wand2 className="w-3.5 h-3.5" />}
                label="Add Video Analysis"
                onClick={() => handleClick(onAddVideoAnalysisNode)}
                color="text-emerald-400"
              />
            )}
            {onAddUploadNode && (
              <MenuItem
                icon={<Upload className="w-3.5 h-3.5" />}
                label={tt.canvas_menu_add_upload || 'Add Upload Resource'}
                onClick={() => handleClick(onAddUploadNode)}
                color="text-emerald-400"
              />
            )}
          </>
        )}

        {type === 'node' && (
          <>
            {(nodeKind === 'image' || nodeKind === 'text') && (
              <>
                <MenuItem
                  icon={<Film className="w-3.5 h-3.5" />}
                  label={t.canvas_menu_gen_video}
                  onClick={() => handleClick(onGenerateVideo!)}
                  color="text-purple-400"
                />
                <MenuItem
                  icon={<ScrollText className="w-3.5 h-3.5" />}
                  label={t.canvas_menu_gen_script}
                  onClick={() => handleClick(onGenerateScript!)}
                  color="text-orange-400"
                />
                <div className="my-1 border-t border-white/5" />
              </>
            )}
            <MenuItem
              icon={<Copy className="w-3.5 h-3.5" />}
              label={t.canvas_menu_copy}
              onClick={() => handleClick(onCopyNode!)}
            />
            <MenuItem
              icon={<Trash2 className="w-3.5 h-3.5" />}
              label={t.canvas_menu_delete}
              onClick={() => handleClick(onDeleteNode!)}
              color="text-red-400"
            />
          </>
        )}
      </div>
    </>
  );
};

function MenuItem({
  icon,
  label,
  onClick,
  color = 'text-zinc-300',
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-white/5 transition-colors ${color}`}
    >
      {icon}
      {label}
    </button>
  );
}
