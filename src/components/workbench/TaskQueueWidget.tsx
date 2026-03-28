import React from 'react';
import { Loader2, CheckCircle, X, Trash2 } from 'lucide-react';
import { useTasks } from '../../context/TaskContext';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';

interface TaskQueueWidgetProps {
  onPreview: (url: string) => void;
}

type LocalProjectMeta = {
  id: string;
  name: string;
  updatedAt: number;
  createdAt?: number;
};

type LocalProjectStore = {
  currentProjectId: string;
  projects: LocalProjectMeta[];
  workspaces: Record<string, any>;
};

const LOCAL_PROJECT_STORE_KEY_PREFIX = 'vflow_workbench_projects_v1';

export const TaskQueueWidget: React.FC<TaskQueueWidgetProps> = ({ onPreview }) => {
  const { t: i18n } = useLanguage();
  const { user } = useAuth();
  const { tasks, removeTask } = useTasks();
  const [isAutoHidden, setIsAutoHidden] = React.useState(false);
  const [isDismissed, setIsDismissed] = React.useState(false);
  const [hasOverflow, setHasOverflow] = React.useState(false);
  const autoHideTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const [nowTs, setNowTs] = React.useState<number>(Date.now());
  const countdownTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const [projectNameMap, setProjectNameMap] = React.useState<Record<string, string>>({});

  const activeCount = tasks.filter(t => t.status === 'pending' || t.status === 'processing').length;
  const recentTasks = tasks.slice(0, 6);

  const lastTasksLenRef = React.useRef<number>(tasks.length);

  React.useEffect(() => {
    const prevLen = lastTasksLenRef.current;
    if (tasks.length > prevLen) {
      setIsDismissed(false);
      setIsAutoHidden(false);
    }
    lastTasksLenRef.current = tasks.length;
  }, [tasks.length]);

  const refreshProjectNameMap = React.useCallback(() => {
    try {
      const userKey = user?.id === null || user?.id === undefined || user?.id === '' ? 'guest' : String(user.id);
      const key = `${LOCAL_PROJECT_STORE_KEY_PREFIX}_${userKey}`;
      const raw = localStorage.getItem(key);
      if (!raw) {
        setProjectNameMap({});
        return;
      }
      const parsed = JSON.parse(raw) as Partial<LocalProjectStore>;
      const projects = Array.isArray(parsed.projects) ? parsed.projects : [];
      const map: Record<string, string> = {};
      projects.forEach((p) => {
        if (!p || typeof p !== 'object') return;
        const id = String((p as any).id || '').trim();
        const name = String((p as any).name || '').trim();
        if (!id || !name) return;
        map[id] = name;
      });
      setProjectNameMap(map);
    } catch {
      setProjectNameMap({});
    }
  }, [user?.id]);

  React.useEffect(() => {
    refreshProjectNameMap();

    const onUpdated = () => refreshProjectNameMap();
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if (!e.key.startsWith(`${LOCAL_PROJECT_STORE_KEY_PREFIX}_`)) return;
      refreshProjectNameMap();
    };

    window.addEventListener('vflow-workbench-projects-updated', onUpdated as EventListener);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('vflow-workbench-projects-updated', onUpdated as EventListener);
      window.removeEventListener('storage', onStorage);
    };
  }, [refreshProjectNameMap]);

  React.useEffect(() => {
    if (autoHideTimerRef.current) {
      clearTimeout(autoHideTimerRef.current);
      autoHideTimerRef.current = null;
    }

    if (activeCount > 0) {
      setIsAutoHidden(false);
      return;
    }

    if (tasks.length > 0) {
      autoHideTimerRef.current = setTimeout(() => {
        setIsAutoHidden(true);
      }, 10_000);
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
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (activeCount > 0) {
      countdownTimerRef.current = setInterval(() => {
        setNowTs(Date.now());
      }, 1000);
    }
    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    };
  }, [activeCount]);

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

  if (!tasks || tasks.length === 0 || isAutoHidden || isDismissed) return null;

  return (
    <div className="absolute bottom-4 right-4 bg-zinc-900/90 border border-white/10 rounded-xl p-3 shadow-2xl w-72 z-50 backdrop-blur">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
          {i18n.wb_bg_tasks_title || '后台任务'}
          {activeCount > 0
            ? `(${(i18n.wb_bg_tasks_running || '{n} 进行中').replace('{n}', String(activeCount))})`
            : ''}
        </h3>
        <button
          type="button"
          onClick={() => {
            setIsDismissed(true);
            setIsAutoHidden(true);
          }}
          className="text-zinc-500 hover:text-zinc-200 transition"
          title={i18n.wb_bg_tasks_close || '关闭'}
          aria-label={i18n.wb_bg_tasks_close || '关闭'}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div
        ref={listRef}
        className={`space-y-2 max-h-52 ${hasOverflow ? 'overflow-y-auto' : 'overflow-y-hidden'} custom-scroll pr-1`}
        style={hasOverflow ? { scrollbarGutter: 'stable' } : undefined}
      >
        {recentTasks.map((task) => {
          const url = task.result?.video_url || task.result?.url;
          const isActive = task.status === 'pending' || task.status === 'processing';
          const workbenchProjectId = String((task as any)?.workbenchProjectId || '').trim();
          const backendProjectId = String((task as any)?.projectId || '').trim();
          const displayProjectId = workbenchProjectId || backendProjectId;
          const projectName = projectNameMap[displayProjectId] || (displayProjectId ? `Project ${displayProjectId.slice(0, 6)}` : 'Project');
          const rawName = task.name || `Task ${task.id}`;
          const taskName = rawName.includes(' / ') ? rawName.split(' / ').slice(1).join(' / ').trim() : rawName;
          const displayName = `${projectName} / ${taskName}`;

          return (
            <div key={task.id} className="flex items-center gap-2 text-[11px]">
              {isActive ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-500 shrink-0" />
              ) : task.status === 'success' ? (
                <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
              ) : (
                <X className="w-3.5 h-3.5 text-red-500 shrink-0" />
              )}

              <button
                className="flex-1 text-left truncate text-zinc-200 hover:text-orange-400 transition"
                onClick={() => {
                  if (url) onPreview(url);
                }}
                title={displayName}
              >
                {displayName}
              </button>

              {(() => {
                const elapsed = Math.max(0, Math.floor((nowTs - task.createdAt) / 1000));
                const left = Math.max(0, 120 - elapsed);
                const remainingTpl = i18n.wb_queue_remaining || '剩余 {s}s';
                const soonDoneText = i18n.wb_queue_soon_done || '马上完成';
                const text = isActive ? (left > 0 ? remainingTpl.replace('{s}', String(left)) : soonDoneText) : '';
                return (
                  <span className="text-[10px] text-zinc-500 shrink-0 min-w-[64px] text-right">
                    {text}
                  </span>
                );
              })()}

              <button
                onClick={() => removeTask(task.id)}
                className="text-zinc-500 hover:text-zinc-200 transition"
                title={i18n.wb_bg_tasks_remove || '移除'}
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