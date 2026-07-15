import { create } from 'zustand';
import { agentImageEditingApi } from './api';
import type {
  AgentImageEditQueueJob,
  AgentImageEditSubmission,
  AgentImageEditSubmissionRecord,
} from './types';

type EnqueueInput = AgentImageEditSubmission & {
  conversationId: string;
  existingRunId?: string;
  aspectRatio?: string;
  resolution?: string;
};

interface AgentImageEditQueueState {
  jobs: AgentImageEditQueueJob[];
  enqueue: (input: EnqueueInput) => string;
  complete: (clientSubmissionId: string, resultSource: AgentImageEditQueueJob['source']) => void;
  fail: (clientSubmissionId: string, error: string) => void;
  retry: (clientSubmissionId: string) => void;
  remove: (clientSubmissionId: string) => void;
  recoverConversation: (conversationId: string) => Promise<void>;
}

const inFlightJobs = new Set<string>();
const retryTimers = new Map<string, number>();

const createSubmissionId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `image-edit-${crypto.randomUUID()}`;
  }
  return `image-edit-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
};

const recordToJob = (conversationId: string, record: AgentImageEditSubmissionRecord): AgentImageEditQueueJob => ({
  clientSubmissionId: record.client_submission_id,
  conversationId,
  runId: record.run_id,
  source: {
    messageId: record.source_message_id,
    url: record.source_image_url,
    role: 'edited_image',
  },
  scope: record.edit_scope,
  prompt: record.prompt,
  maskUrl: record.mask_url,
  status: record.status === 'submitting' ? 'queued' : record.status,
  error: record.error || undefined,
  createdAt: record.created_at ? Date.parse(record.created_at) : Date.now(),
  updatedAt: record.updated_at ? Date.parse(record.updated_at) : Date.now(),
});

const updateJob = (clientSubmissionId: string, updates: Partial<AgentImageEditQueueJob>) => {
  useAgentImageEditQueueStore.setState((state) => ({
    jobs: state.jobs.map((job) => (
      job.clientSubmissionId === clientSubmissionId
        ? { ...job, ...updates, updatedAt: Date.now() }
        : job
    )),
  }));
};

const scheduleRetry = (clientSubmissionId: string, delayMs = 2000) => {
  const current = retryTimers.get(clientSubmissionId);
  if (current) window.clearTimeout(current);
  retryTimers.set(clientSubmissionId, window.setTimeout(() => {
    retryTimers.delete(clientSubmissionId);
    pumpQueue();
  }, Math.max(500, delayMs)));
};

const processJob = async (clientSubmissionId: string) => {
  const initial = useAgentImageEditQueueStore.getState().jobs.find((job) => job.clientSubmissionId === clientSubmissionId);
  if (!initial || inFlightJobs.has(clientSubmissionId) || initial.status !== 'queued') return;
  inFlightJobs.add(clientSubmissionId);
  try {
    const reserved = await agentImageEditingApi.reserveSubmission(initial.conversationId, {
      clientSubmissionId,
      runId: initial.existingRunId,
      source: initial.source,
      scope: initial.scope,
      prompt: initial.prompt,
      aspectRatio: initial.aspectRatio,
      resolution: initial.resolution,
    });
    updateJob(clientSubmissionId, { runId: reserved.run_id });

    let current = useAgentImageEditQueueStore.getState().jobs.find((job) => job.clientSubmissionId === clientSubmissionId);
    if (!current) return;
    if (current.scope === 'local' && !current.maskUrl) {
      if (!current.maskBlob) {
        updateJob(clientSubmissionId, { status: 'failed', error: 'mask_missing_after_reload' });
        return;
      }
      updateJob(clientSubmissionId, { status: 'uploading' });
      const uploaded = await agentImageEditingApi.uploadMask(current.conversationId, {
        source: current.source,
        maskBlob: current.maskBlob,
      });
      updateJob(clientSubmissionId, { maskUrl: uploaded.mask_url, maskBlob: undefined });
    }

    current = useAgentImageEditQueueStore.getState().jobs.find((job) => job.clientSubmissionId === clientSubmissionId);
    if (!current?.runId) throw new Error('Image edit run was not reserved');
    updateJob(clientSubmissionId, { status: 'submitting' });
    const result = await agentImageEditingApi.dispatchSubmission(current.runId, {
      clientSubmissionId,
      maskUrl: current.maskUrl,
      retry: current.retryRequested,
    });
    if (result.status === 'queued' || result.status === 'submitting') {
      updateJob(clientSubmissionId, {
        status: 'queued',
        error: undefined,
        retryRequested: current.retryRequested,
      });
      scheduleRetry(clientSubmissionId, result.retry_after_ms || 2000);
      return;
    }
    if (result.status === 'failed') {
      updateJob(clientSubmissionId, {
        status: 'failed',
        error: result.error || 'image_edit_failed',
        retryRequested: false,
      });
      return;
    }
    updateJob(clientSubmissionId, {
      status: 'processing',
      error: undefined,
      retryRequested: false,
      maskBlob: undefined,
    });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason);
    updateJob(clientSubmissionId, { status: 'failed', error: message });
  } finally {
    inFlightJobs.delete(clientSubmissionId);
    pumpQueue();
  }
};

const pumpQueue = () => {
  const jobs = [...useAgentImageEditQueueStore.getState().jobs].sort((a, b) => a.createdAt - b.createdAt);
  const busyConversations = new Set(
    jobs
      .filter((job) => inFlightJobs.has(job.clientSubmissionId))
      .map((job) => job.conversationId),
  );
  for (const job of jobs) {
    if (job.status !== 'queued' || busyConversations.has(job.conversationId)) continue;
    busyConversations.add(job.conversationId);
    void processJob(job.clientSubmissionId);
  }
};

export const useAgentImageEditQueueStore = create<AgentImageEditQueueState>((set) => ({
  jobs: [],
  enqueue: (input) => {
    const clientSubmissionId = createSubmissionId();
    const now = Date.now();
    set((state) => ({
      jobs: [...state.jobs, {
        clientSubmissionId,
        conversationId: input.conversationId,
        existingRunId: input.existingRunId,
        source: input.source,
        scope: input.scope,
        prompt: input.prompt,
        aspectRatio: input.aspectRatio,
        resolution: input.resolution,
        maskBlob: input.maskBlob,
        status: 'queued',
        createdAt: now,
        updatedAt: now,
      }],
    }));
    queueMicrotask(pumpQueue);
    return clientSubmissionId;
  },
  complete: (clientSubmissionId, resultSource) => {
    updateJob(clientSubmissionId, {
      status: 'completed',
      resultSource,
      error: undefined,
      maskBlob: undefined,
      retryRequested: false,
    });
  },
  fail: (clientSubmissionId, error) => {
    updateJob(clientSubmissionId, { status: 'failed', error });
  },
  retry: (clientSubmissionId) => {
    updateJob(clientSubmissionId, {
      status: 'queued',
      error: undefined,
      resultSource: undefined,
      retryRequested: true,
    });
    queueMicrotask(pumpQueue);
  },
  remove: (clientSubmissionId) => {
    const timer = retryTimers.get(clientSubmissionId);
    if (timer) window.clearTimeout(timer);
    retryTimers.delete(clientSubmissionId);
    set((state) => ({ jobs: state.jobs.filter((job) => job.clientSubmissionId !== clientSubmissionId) }));
  },
  recoverConversation: async (conversationId) => {
    const records = await agentImageEditingApi.listSubmissions(conversationId);
    set((state) => {
      const next = [...state.jobs];
      for (const record of records) {
        const index = next.findIndex((job) => job.clientSubmissionId === record.client_submission_id);
        if (index >= 0) {
          const local = next[index];
          next[index] = {
            ...local,
            runId: record.run_id || local.runId,
            maskUrl: record.mask_url || local.maskUrl,
            status: record.status === 'submitting' ? 'queued' : record.status,
            error: record.error || local.error,
            updatedAt: Date.now(),
          };
        } else {
          const restored = recordToJob(conversationId, record);
          if (restored.scope === 'local' && !restored.maskUrl && restored.status === 'queued') {
            restored.status = 'failed';
            restored.error = 'mask_missing_after_reload';
          }
          next.push(restored);
        }
      }
      return { jobs: next };
    });
    queueMicrotask(pumpQueue);
  },
}));

export const agentImageEditQueue = {
  enqueue: (input: EnqueueInput) => useAgentImageEditQueueStore.getState().enqueue(input),
  complete: (clientSubmissionId: string, resultSource: AgentImageEditQueueJob['source']) => (
    useAgentImageEditQueueStore.getState().complete(clientSubmissionId, resultSource)
  ),
  fail: (clientSubmissionId: string, error: string) => (
    useAgentImageEditQueueStore.getState().fail(clientSubmissionId, error)
  ),
  retry: (clientSubmissionId: string) => useAgentImageEditQueueStore.getState().retry(clientSubmissionId),
  remove: (clientSubmissionId: string) => useAgentImageEditQueueStore.getState().remove(clientSubmissionId),
  recoverConversation: (conversationId: string) => useAgentImageEditQueueStore.getState().recoverConversation(conversationId),
};
