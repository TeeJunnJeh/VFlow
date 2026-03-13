import React from 'react';
import { Loader2, CheckCircle, X, Trash2 } from 'lucide-react';
import { useTasks } from '../../context/TaskContext';

interface TaskQueueWidgetProps {
  onPreview: (url: string) => void;
}

export const TaskQueueWidget: React.FC<TaskQueueWidgetProps> = ({ onPreview }) => {
  const { tasks, removeTask } = useTasks();
  const [isAutoHidden, setIsAutoHidden] = React.useState(false);
  const [hasOverflow, setHasOverflow] = React.useState(false);
  const autoHideTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);

  const activeCount = tasks.filter(t => t.status === 'pending' || t.status === 'processing').length;
  const recentTasks = tasks.slice(0, 6);

  React.useEffect(() => {
    if (autoHideTimerRef.current) {
      clearTimeout(autoHideTimerRef.current);
      autoHideTimerRef.current = null;
    }

    // Keep widget visible while any task is still running.
    if (activeCount > 0) {
      setIsAutoHidden(false);
      return;
    }

    // Auto-hide widget 60s after all tasks complete/stop.
    if (tasks.length > 0) {
      autoHideTimerRef.current = setTimeout(() => {
        setIsAutoHidden(true);
      }, 60_000);
    } else {
      setIsAutoHidden(false);
    }

    return () => {
      if (autoHideTimerRef.current) {
        clearTimeout(autoHideTimerRef.current);
        autoHideTimerRef.current = null;
      }
    };
  }, [activeCount, tasks.length]);

  React.useEffect(() => {
    const checkOverflow = () => {
      const el = listRef.current;
      if (!el) return;
      setHasOverflow(el.scrollHeight - el.clientHeight > 1);
    };

    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [recentTasks.length]);

  if (!tasks || tasks.length === 0 || isAutoHidden) return null;

  return (
    <div className="absolute bottom-4 right-4 bg-zinc-900/90 border border-white/10 rounded-xl p-3 shadow-2xl w-72 z-50 backdrop-blur">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
          后台任务 {activeCount > 0 ? `(${activeCount} 进行中)` : ''}
        </h3>
      </div>

      <div
        ref={listRef}
        className={`space-y-2 max-h-52 ${hasOverflow ? 'overflow-y-auto' : 'overflow-y-hidden'} custom-scroll pr-1`}
        style={hasOverflow ? { scrollbarGutter: 'stable' } : undefined}
      >
        {recentTasks.map(t => {
          const url = t.result?.video_url || t.result?.url;
          const isActive = t.status === 'pending' || t.status === 'processing';

          return (
            <div key={t.id} className="flex items-center gap-2 text-[11px]">
              {isActive ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-500 shrink-0" />
              ) : t.status === 'success' ? (
                <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
              ) : (
                <X className="w-3.5 h-3.5 text-red-500 shrink-0" />
              )}

              <button
                className="flex-1 text-left truncate text-zinc-200 hover:text-orange-400 transition"
                onClick={() => {
                  if (url) onPreview(url);
                }}
                title={t.name || `Task ${t.id}`}
              >
                {t.name || `Task ${t.id}`}
              </button>

              <button
                onClick={() => removeTask(t.id)}
                className="text-zinc-500 hover:text-zinc-200 transition"
                title="移除"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};