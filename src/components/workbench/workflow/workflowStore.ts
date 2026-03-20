import { create } from 'zustand';

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
export type StepType = 'info_collection' | 'validation' | 'optimization' | 'generation' | 'finalization';
export type WorkflowStatus = 'idle' | 'running' | 'completed' | 'failed';

export interface WorkflowStep {
  id: string;
  title: string;
  description: string;
  type: StepType;
  status: StepStatus;
  input: Record<string, any>;
  output?: Record<string, any>;
  error?: {
    code?: string;
    message: string;
    details?: any;
  };
  createdAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  progress?: number;
  estimatedRemaining?: number;
  dependsOn?: string[];
  isExpanded?: boolean;
}

export interface Workflow {
  id: string;
  projectId: string;
  userId: string;
  steps: WorkflowStep[];
  currentStepIndex: number;
  overallProgress: number;
  status: WorkflowStatus;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  metadata?: {
    executionPath?: 'direct_video' | 'script_then_video';
    costSummary?: { v_points: number };
    shareLink?: string;
  };
}

export interface WorkflowStore {
  workflow: Workflow | null;
  updateWorkflow: (workflow: Workflow) => void;
  updateStep: (stepId: string, updates: Partial<WorkflowStep>) => void;
  toggleStepExpanded: (stepId: string) => void;
  resetWorkflow: () => void;
  setStepStatus: (stepId: string, status: StepStatus) => void;
  setStepProgress: (stepId: string, progress: number, estimatedRemaining?: number) => void;
  completeStep: (stepId: string, output?: Record<string, any>) => void;
  failStep: (stepId: string, error: { code?: string; message: string; details?: any }) => void;
  advanceToNextStep: () => void;
}

export const useWorkflowStore = create<WorkflowStore>((set) => ({
  workflow: null,

  updateWorkflow: (workflow) => {
    set({ workflow });
  },

  updateStep: (stepId, updates) => {
    set((state) => {
      if (!state.workflow) return state;
      return {
        workflow: {
          ...state.workflow,
          steps: state.workflow.steps.map((step) =>
            step.id === stepId ? { ...step, ...updates } : step
          ),
        },
      };
    });
  },

  toggleStepExpanded: (stepId) => {
    set((state) => {
      if (!state.workflow) return state;
      return {
        workflow: {
          ...state.workflow,
          steps: state.workflow.steps.map((step) =>
            step.id === stepId ? { ...step, isExpanded: !step.isExpanded } : step
          ),
        },
      };
    });
  },

  setStepStatus: (stepId, status) => {
    set((state) => {
      if (!state.workflow) return state;
      return {
        workflow: {
          ...state.workflow,
          steps: state.workflow.steps.map((step) =>
            step.id === stepId ? { ...step, status } : step
          ),
        },
      };
    });
  },

  setStepProgress: (stepId, progress, estimatedRemaining) => {
    set((state) => {
      if (!state.workflow) return state;
      return {
        workflow: {
          ...state.workflow,
          steps: state.workflow.steps.map((step) =>
            step.id === stepId
              ? { ...step, progress, estimatedRemaining }
              : step
          ),
        },
      };
    });
  },

  completeStep: (stepId, output) => {
    set((state) => {
      if (!state.workflow) return state;
      const updatedSteps = state.workflow.steps.map((step) =>
        step.id === stepId
          ? { ...step, status: 'completed' as StepStatus, output, completedAt: new Date() }
          : step
      );
      return {
        workflow: {
          ...state.workflow,
          steps: updatedSteps,
        },
      };
    });
  },

  failStep: (stepId, error) => {
    set((state) => {
      if (!state.workflow) return state;
      return {
        workflow: {
          ...state.workflow,
          steps: state.workflow.steps.map((step) =>
            step.id === stepId
              ? { ...step, status: 'failed' as StepStatus, error, completedAt: new Date() }
              : step
          ),
          status: 'failed' as WorkflowStatus,
        },
      };
    });
  },

  advanceToNextStep: () => {
    set((state) => {
      if (!state.workflow) return state;
      const nextIndex = state.workflow.currentStepIndex + 1;
      const nextStep = state.workflow.steps[nextIndex];
      if (!nextStep) {
        return {
          workflow: {
            ...state.workflow,
            status: 'completed' as WorkflowStatus,
            completedAt: new Date(),
          },
        };
      }
      return {
        workflow: {
          ...state.workflow,
          currentStepIndex: nextIndex,
          steps: state.workflow.steps.map((step, idx) =>
            idx === nextIndex
              ? { ...step, status: 'running' as StepStatus, startedAt: new Date() }
              : step
          ),
        },
      };
    });
  },

  resetWorkflow: () => {
    set({ workflow: null });
  },
}));
