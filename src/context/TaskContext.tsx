import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { ApiError } from '../services/errors';
import { normalizeTaskError } from '../utils/taskError';

export type TaskStatus = 'pending' | 'processing' | 'success' | 'failed';

export type TaskType = 'video_generation' | 'script_generation' | 'image_generation';

export type TaskNavigateTo = {
  view?: string;
  focus?: string;
};

export interface Task {
  id: string | number;       // backend GenerationTask.id
  projectId?: string;        // projects.Project UUID
  workbenchProjectId?: string; // Workbench local project id
  estimatedSeconds?: number; // from /api/tasks/estimate/
  type: TaskType;
  navigateTo?: TaskNavigateTo;
  status: TaskStatus;
  name?: string;
  thumbnail?: string;
  result?: any;
  createdAt: number;
  updatedAt?: number;
}

interface TaskContextType {
  tasks: Task[];
  addTask: (task: Task) => void;
  updateTask: (taskId: Task['id'], patch: Partial<Task>) => void;
  upsertTask: (task: Task) => void;
  removeTask: (taskId: Task['id']) => void;
  clearTasks: () => void;
  getTaskByProjectId: (projectId: string) => Task | undefined;
}

const TaskContext = createContext<TaskContextType | undefined>(undefined);

const STORAGE_KEY_PREFIX = 'vflow_tasks_v1';

const normalizeStoredTask = (raw: any): Task | null => {
  if (!raw || typeof raw !== 'object') return null;

  const id = raw.id;
  if (id === null || id === undefined || id === '') return null;

  const status = raw.status === 'pending' || raw.status === 'processing' || raw.status === 'success' || raw.status === 'failed'
    ? raw.status
    : 'pending';

  const type: TaskType = raw.type === 'script_generation'
    ? 'script_generation'
    : raw.type === 'image_generation'
      ? 'image_generation'
      : 'video_generation';

  const createdAtRaw = Number(raw.createdAt);
  const updatedAtRaw = Number(raw.updatedAt);

  const navigateTo = raw.navigateTo && typeof raw.navigateTo === 'object'
    ? {
      view: typeof raw.navigateTo.view === 'string' ? raw.navigateTo.view : undefined,
      focus: typeof raw.navigateTo.focus === 'string' ? raw.navigateTo.focus : undefined,
    }
    : undefined;

  return {
    id,
    projectId: typeof raw.projectId === 'string' ? raw.projectId : undefined,
    workbenchProjectId: typeof raw.workbenchProjectId === 'string' ? raw.workbenchProjectId : undefined,
    estimatedSeconds: Number.isFinite(Number(raw.estimatedSeconds)) ? Number(raw.estimatedSeconds) : undefined,
    type,
    navigateTo,
    status,
    name: typeof raw.name === 'string' ? raw.name : undefined,
    thumbnail: typeof raw.thumbnail === 'string' ? raw.thumbnail : undefined,
    result: raw.result,
    createdAt: Number.isFinite(createdAtRaw) && createdAtRaw > 0 ? createdAtRaw : Date.now(),
    updatedAt: Number.isFinite(updatedAtRaw) && updatedAtRaw > 0 ? updatedAtRaw : undefined,
  };
};

export const TaskProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);

  // Use a ref to avoid stale closures inside setInterval.
  const tasksRef = useRef<Task[]>([]);
  const pollIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  // Load persisted tasks when user changes.
  useEffect(() => {
    if (!user?.id) {
      setTasks([]);
      return;
    }
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}_${user.id}`);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const normalized = parsed
          .map((item) => normalizeStoredTask(item))
          .filter(Boolean) as Task[];
        setTasks(normalized);
      }
    } catch (e) {
      console.warn('Failed to load tasks from localStorage', e);
    }
  }, [user?.id]);

  // Persist tasks.
  useEffect(() => {
    if (!user?.id) return;
    try {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}_${user.id}`, JSON.stringify(tasks));
    } catch (e) {
      console.warn('Failed to persist tasks to localStorage', e);
    }
  }, [tasks, user?.id]);

  const addTask = (task: Task) => {
    setTasks(prev => [task, ...prev]);
  };

  const updateTask = (taskId: Task['id'], patch: Partial<Task>) => {
    setTasks((prev) => prev.map((task) => (task.id === taskId ? { ...task, ...patch, updatedAt: Date.now() } : task)));
  };

  const upsertTask = (task: Task) => {
    setTasks((prev) => {
      const index = prev.findIndex((item) => item.id === task.id);
      if (index < 0) return [task, ...prev];

      const next = [...prev];
      next[index] = { ...next[index], ...task, updatedAt: Date.now() };
      return next;
    });
  };

  const removeTask = (taskId: Task['id']) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
  };

  const clearTasks = () => {
    setTasks([]);
  };

  const getTaskByProjectId = (projectId: string) => {
    return tasks.find(t => t.projectId === projectId);
  };

  const stopPolling = () => {
    if (!pollIntervalRef.current) return;
    window.clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = null;
  };

  const pollOnce = async () => {
    const normalizeStatus = (status: TaskStatus): TaskStatus => {
      return status === 'pending' ? 'processing' : status;
    };

    const activeTasks = tasksRef.current.filter((t) => (
      (t.status === 'pending' || t.status === 'processing')
      && t.type === 'video_generation'
    ));
    if (activeTasks.length === 0) {
      stopPolling();
      return;
    }

    const updates = await Promise.all(activeTasks.map(async (task) => {
      try {
        const response = await fetch(`/api/tasks/${task.id}/status/`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
          credentials: 'include',
        });

        if (!response.ok) return null;
        const json = await response.json();

        // ── 后端返回 build_simple_error 格式（code !== 0）──
        // 这不是 "轮询无更新"，而是真正的错误，需要通知用户
        if (json?.code !== 0) {
          const apiErr = new ApiError(
            json?.message || '任务状态查询失败',
            {
              status: response.status,
              errorCode: json?.error_code,
              trackingId: json?.tracking_id,
              data: json?.data || null,
            },
          );
          return { id: task.id, status: 'failed' as TaskStatus, result: null, apiError: apiErr };
        }

        if (!json?.data) return null;

        const remoteStatusRaw = (json.data.status ?? '').toString().toLowerCase() as TaskStatus;
        if (!remoteStatusRaw) return null;
        const remoteStatus = normalizeStatus(remoteStatusRaw);

        const result = json.data.result;
        if (remoteStatus !== normalizeStatus(task.status)) {
          return { id: task.id, status: remoteStatus, result };
        }
      } catch (e) {
        console.error(`Task ${task.id} poll failed`, e);
      }
      return null;
    }));

    const validUpdates = updates.filter(Boolean) as Array<{ id: Task['id']; status: TaskStatus; result?: any; apiError?: ApiError }>;
    if (validUpdates.length === 0) return;

    validUpdates.forEach((update) => {
      if (update.status !== 'failed') return;

      // 优先使用已解析的 ApiError（来自 code !== 0 的响应）
      if (update.apiError) {
        window.dispatchEvent(new CustomEvent('vflow-app-error', {
          detail: { apiError: update.apiError },
        }));
        return;
      }

      // 兜底：任务本身 status === failed（来自 data.result 里的信息）
      const result = update.result || {};
      const baseError = normalizeTaskError(result, '后台任务执行失败');
      const trackingId = result?.tracking_id;
      const errorCode = result?.error_code;
      const apiErr = new ApiError(
        baseError,
        {
          status: 500,
          errorCode: errorCode || 'VIDEO_GENERATION_FAILED',
          trackingId: trackingId || undefined,
          data: result,
        },
      );
      window.dispatchEvent(new CustomEvent('vflow-app-error', {
        detail: { apiError: apiErr },
      }));
    });

    setTasks(prev => prev.map(t => {
      const update = validUpdates.find(u => u.id === t.id);
      if (!update) return t;
      return { ...t, status: update.status, result: update.result, updatedAt: Date.now() };
    }));
  };

  // Start/stop polling based on active tasks + auth state.
  useEffect(() => {
    if (!user?.id) {
      stopPolling();
      return;
    }

    const hasActive = tasks.some(t => t.status === 'pending' || t.status === 'processing');
    if (!hasActive) {
      stopPolling();
      return;
    }

    if (!pollIntervalRef.current) {
      pollOnce(); // kick off immediately
      pollIntervalRef.current = window.setInterval(pollOnce, 3000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, user?.id]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(() => ({
    tasks,
    addTask,
    updateTask,
    upsertTask,
    removeTask,
    clearTasks,
    getTaskByProjectId,
  }), [tasks]);

  return (
    <TaskContext.Provider value={value}>
      {children}
    </TaskContext.Provider>
  );
};

export const useTasks = () => {
  const context = useContext(TaskContext);
  if (!context) throw new Error('useTasks must be used within TaskProvider');
  return context;
};

