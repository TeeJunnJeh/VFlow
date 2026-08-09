/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type WorkbenchModel = 'kling' | 'sora2' | 'sora2pro' | 'seedance2.5';

type WorkbenchModelContextType = {
  model: WorkbenchModel;
  setModel: (model: WorkbenchModel) => void;
};

const STORAGE_KEY = 'vflow_workbench_model';

const WorkbenchModelContext = createContext<WorkbenchModelContextType | undefined>(undefined);

const normalizeModel = (value: string | null): WorkbenchModel => {
  if (value === 'kling') return 'kling';
  if (value === 'seedance2.0' || value === 'seedance-2.0' || value === 'seedance2.5') return 'seedance2.5';
  return 'seedance2.5';
};

export const WorkbenchModelProvider = ({ children }: { children: React.ReactNode }) => {
  const [model, setModel] = useState<WorkbenchModel>(() => normalizeModel(localStorage.getItem(STORAGE_KEY)));

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, model);
  }, [model]);

  const value = useMemo(() => ({ model, setModel }), [model]);

  return <WorkbenchModelContext.Provider value={value}>{children}</WorkbenchModelContext.Provider>;
};

export const useWorkbenchModel = () => {
  const context = useContext(WorkbenchModelContext);
  if (!context) throw new Error('useWorkbenchModel must be used within a WorkbenchModelProvider');
  return context;
};
