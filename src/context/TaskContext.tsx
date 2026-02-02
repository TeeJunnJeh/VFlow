import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';

export type TaskStatus = 'pending' | 'processing' | 'success' | 'failed';

export interface Task {
  id: string | number;       // backend GenerationTask.id
  projectId: string;         // projects.Project UUID
  type: 'video_generation';
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
  removeTask: (taskId: Task['id']) => void;
  clearTasks: () => void;
  getTaskByProjectId: (projectId: string) => Task | undefined;
}

const TaskContext = createContext<TaskContextType | undefined>(undefined);

const STORAGE_KEY_PREFIX = 'vflow_tasks_v1';

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
      if (Array.isArray(parsed)) setTasks(parsed);
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
    const activeTasks = tasksRef.current.filter(t => t.status === 'pending' || t.status === 'processing');
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

        if (json?.code !== 0 || !json?.data) return null;

        const remoteStatus = (json.data.status ?? '').toString().toLowerCase() as TaskStatus;
        if (!remoteStatus) return null;

        const result = json.data.result;
        if (remoteStatus !== task.status || result !== task.result) {
          return { id: task.id, status: remoteStatus, result };
        }
      } catch (e) {
        console.error(`Task ${task.id} poll failed`, e);
      }
      return null;
    }));

    const validUpdates = updates.filter(Boolean) as Array<{ id: Task['id']; status: TaskStatus; result?: any }>;
    if (validUpdates.length === 0) return;

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

