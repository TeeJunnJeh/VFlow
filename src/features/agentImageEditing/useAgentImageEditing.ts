import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AgentAction, AgentMessage } from '../../services/agentRuntime';
import {
  getConversationEditableImageSources,
  getMessageEditableImageSources,
  getMessageRunIds,
  hasPendingAgentImageAssets,
  isFailedAgentImageAsset,
} from './imageSources';
import { getAgentImageEditingCopy } from './i18n';
import { agentImageEditQueue, useAgentImageEditQueueStore } from './queueStore';
import type {
  AgentImageEditQueueJob,
  AgentImageEditScope,
  AgentImageEditSource,
  AgentImageEditSubmission,
} from './types';

export interface AgentImageEditDialogState {
  conversationId: string | null;
  sources: AgentImageEditSource[];
  initialSourceUrl?: string;
  initialScope: AgentImageEditScope;
  initialPrompt: string;
  runId?: string;
  aspectRatio?: string;
  resolution?: string;
}

interface UseAgentImageEditingOptions {
  activeConversationId: string | null;
  messages: AgentMessage[];
  language: string;
  refreshConversation: (conversationId: string) => void | Promise<void>;
  resetSuggestion: () => void;
  showInfo: (title: string, message: string) => void;
  closePreview: () => void;
  openPreview: (source: AgentImageEditSource) => void;
}

export const useAgentImageEditing = ({
  activeConversationId,
  messages,
  language,
  refreshConversation,
  resetSuggestion,
  showInfo,
  closePreview,
  openPreview,
}: UseAgentImageEditingOptions) => {
  const jobs = useAgentImageEditQueueStore((state) => state.jobs);
  const [dialog, setDialog] = useState<AgentImageEditDialogState | null>(null);
  const restoredConversationsRef = useRef<Set<string>>(new Set());
  const refreshConversationRef = useRef(refreshConversation);

  const copy = getAgentImageEditingCopy(language);
  const sources = useMemo(() => getConversationEditableImageSources(messages), [messages]);

  useEffect(() => {
    refreshConversationRef.current = refreshConversation;
  }, [refreshConversation]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDialog(null), 0);
    return () => window.clearTimeout(timer);
  }, [activeConversationId]);

  useEffect(() => {
    if (!activeConversationId || restoredConversationsRef.current.has(activeConversationId)) return;
    restoredConversationsRef.current.add(activeConversationId);
    void agentImageEditQueue.recoverConversation(activeConversationId).catch((error) => {
      console.error('Failed to restore image edit submissions:', error);
      restoredConversationsRef.current.delete(activeConversationId);
    });
  }, [activeConversationId]);

  useEffect(() => {
    if (!activeConversationId) return;
    const activeJobs = jobs.filter((job) => job.conversationId === activeConversationId);
    let needsRefresh = false;

    activeJobs.forEach((job) => {
      if (job.status !== 'processing' || !job.runId) return;
      const resultMessage = [...messages].reverse().find((message) => (
        message.role === 'tool' && getMessageRunIds(message).includes(job.runId || '')
      ));
      const resultSources = resultMessage ? getMessageEditableImageSources(resultMessage) : [];
      const resultSource = resultSources.find((source) => source.role === 'edited_image') || resultSources[0];
      if (resultSource) {
        agentImageEditQueue.complete(job.clientSubmissionId, resultSource);
        return;
      }
      if (resultMessage) {
        const toolStatus = String(resultMessage.tool_result?.status || '').trim().toLowerCase();
        const assets = [
          ...(Array.isArray(resultMessage.tool_result?.assets) ? resultMessage.tool_result.assets : []),
          ...(Array.isArray(resultMessage.attachments) ? resultMessage.attachments : []),
        ];
        if (toolStatus === 'failed' || assets.some(isFailedAgentImageAsset)) {
          agentImageEditQueue.fail(
            job.clientSubmissionId,
            String(resultMessage.tool_result?.error_message || resultMessage.content || 'image_edit_failed'),
          );
          return;
        }
      }
      needsRefresh = needsRefresh || !resultMessage || !hasPendingAgentImageAssets([resultMessage]);
    });

    if (!needsRefresh || document.hidden) return;
    const timer = window.setTimeout(() => {
      void refreshConversationRef.current(activeConversationId);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [activeConversationId, jobs, messages]);

  const openForSource = useCallback((source: AgentImageEditSource) => {
    closePreview();
    setDialog({
      conversationId: activeConversationId,
      sources: sources.length > 0 ? sources : [source],
      initialSourceUrl: source.url,
      initialScope: 'local',
      initialPrompt: '',
    });
  }, [activeConversationId, closePreview, sources]);

  const openForAction = useCallback((action: AgentAction) => {
    const params = action.params || {};
    if (sources.length === 0) {
      showInfo(copy.title, copy.noSource);
      return;
    }
    setDialog({
      conversationId: activeConversationId,
      sources,
      initialSourceUrl: sources[0]?.url,
      initialScope: String(params.edit_scope || 'local') === 'global' ? 'global' : 'local',
      initialPrompt: String(params.prompt || '').trim(),
      runId: action.run_id,
      aspectRatio: String(params.aspect_ratio || '1:1'),
      resolution: String(params.resolution || '2K'),
    });
  }, [activeConversationId, copy.noSource, copy.title, showInfo, sources]);

  const submit = useCallback(async (submission: AgentImageEditSubmission) => {
    if (!dialog || dialog.conversationId !== activeConversationId || !activeConversationId) return;
    resetSuggestion();
    if (submission.scope === 'local' && !submission.maskBlob) {
      throw new Error(copy.selectionRequired);
    }
    agentImageEditQueue.enqueue({
      conversationId: activeConversationId,
      existingRunId: dialog.runId,
      source: submission.source,
      scope: submission.scope,
      prompt: submission.prompt,
      maskBlob: submission.maskBlob,
      aspectRatio: dialog.aspectRatio,
      resolution: dialog.resolution,
    });
    setDialog(null);
    closePreview();
  }, [activeConversationId, closePreview, copy.selectionRequired, dialog, resetSuggestion]);

  const reopen = useCallback((job: AgentImageEditQueueJob) => {
    const source = sources.find((item) => item.url === job.source.url) || job.source;
    agentImageEditQueue.remove(job.clientSubmissionId);
    setDialog({
      conversationId: activeConversationId,
      sources: sources.length > 0 ? sources : [source],
      initialSourceUrl: source.url,
      initialScope: job.scope,
      initialPrompt: job.prompt,
      runId: job.runId,
      aspectRatio: job.aspectRatio,
      resolution: job.resolution,
    });
  }, [activeConversationId, sources]);

  const openResult = useCallback((job: AgentImageEditQueueJob) => {
    if (job.resultSource) openPreview(job.resultSource);
  }, [openPreview]);

  return {
    copy,
    dialog: dialog?.conversationId === activeConversationId ? dialog : null,
    jobs,
    closeDialog: () => setDialog(null),
    openForAction,
    openForSource,
    openResult,
    reopen,
    submit,
  };
};
