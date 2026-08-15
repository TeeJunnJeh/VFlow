import { useCallback, useEffect, useRef, useState } from 'react';
import { agentRuntimeApi, type AgentAction, type AgentRunReadiness } from '../../services/agentRuntime';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export const useAgentProductRunDraft = ({
  action,
  disabled,
  submitting,
  normalize,
  onRunUpdated,
}: {
  action: AgentAction;
  disabled: boolean;
  submitting: boolean;
  normalize: (params: Record<string, unknown>) => Record<string, unknown>;
  onRunUpdated?: (runId: string, params: Record<string, unknown>, readiness?: AgentRunReadiness | null) => void;
}) => {
  const [params, setParams] = useState<Record<string, unknown>>(() => normalize(action.params || {}));
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [dirtyVersion, setDirtyVersion] = useState(0);
  const saveTokenRef = useRef(0);

  useEffect(() => {
    if (!action.run_id || dirtyVersion === 0 || disabled || submitting) return;
    const token = ++saveTokenRef.current;
    const timer = window.setTimeout(() => {
      void agentRuntimeApi.updateRun(action.run_id!, params)
        .then((run) => {
          if (saveTokenRef.current !== token) return;
          setSaveState('saved');
          setDirtyVersion(0);
          onRunUpdated?.(action.run_id!, params, run.readiness);
        })
        .catch(() => {
          if (saveTokenRef.current === token) setSaveState('error');
        });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [action.run_id, dirtyVersion, disabled, onRunUpdated, params, submitting]);

  const updateParams = useCallback((patch: Record<string, unknown>) => {
    setParams((previous) => ({ ...previous, ...patch }));
    setSaveState('saving');
    setDirtyVersion((version) => version + 1);
  }, []);

  return { params, updateParams, saveState };
};
