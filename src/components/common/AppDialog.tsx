import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface AppDialogProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  widthClassName?: string;
  titleClassName?: string;
}

export const AppDialog: React.FC<AppDialogProps> = ({
  isOpen,
  title,
  onClose,
  children,
  footer,
  widthClassName = 'max-w-md',
  titleClassName = 'text-sm',
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6" onClick={onClose}>
      <div
        className={`w-full ${widthClassName} glass-panel rounded-2xl border border-white/10 p-6 shadow-2xl max-h-[calc(100vh-3rem)] flex flex-col`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 mb-4 shrink-0">
          <h3 className={`${titleClassName} font-bold text-zinc-100`}>{title}</h3>
          <button className="text-zinc-400 hover:text-white transition" onClick={onClose} aria-label="Close dialog">
            <X className="w-5 h-5" />
          </button>
        </div>

        {children ? <div className="text-sm text-zinc-300 min-h-0 flex-1 overflow-y-auto pr-1">{children}</div> : null}

        {footer ? <div className="mt-5 flex justify-end gap-3 shrink-0">{footer}</div> : null}
      </div>
    </div>
  );
};
