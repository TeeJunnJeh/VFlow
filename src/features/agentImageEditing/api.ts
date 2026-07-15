import { apiRequest } from '../../services/apiClient';
import type {
  AgentImageEditScope,
  AgentImageEditSource,
  AgentImageEditSubmissionRecord,
} from './types';

export const agentImageEditingApi = {
  reserveSubmission: async (
    conversationId: string,
    payload: {
      clientSubmissionId: string;
      runId?: string;
      source: AgentImageEditSource;
      scope: AgentImageEditScope;
      prompt: string;
      aspectRatio?: string;
      resolution?: string;
    },
  ): Promise<AgentImageEditSubmissionRecord> => {
    const json = await apiRequest(`/api/agent/conversations/${conversationId}/image-edit-submissions/`, {
      method: 'POST',
      body: {
        client_submission_id: payload.clientSubmissionId,
        ...(payload.runId ? { run_id: payload.runId } : {}),
        source_message_id: payload.source.messageId,
        source_image_url: payload.source.url,
        edit_scope: payload.scope,
        prompt: payload.prompt,
        ...(payload.aspectRatio ? { aspect_ratio: payload.aspectRatio } : {}),
        ...(payload.resolution ? { resolution: payload.resolution } : {}),
      },
      fallbackMessage: 'Failed to reserve the image edit',
    });
    return json?.data;
  },

  uploadMask: async (
    conversationId: string,
    payload: { source: AgentImageEditSource; maskBlob: Blob },
  ): Promise<{ mask_url: string; width: number; height: number; size: number }> => {
    const formData = new FormData();
    formData.append('file', new File([payload.maskBlob], 'agent-image-mask.png', { type: 'image/png' }));
    formData.append('source_message_id', payload.source.messageId);
    formData.append('source_image_url', payload.source.url);
    const json = await apiRequest(`/api/agent/conversations/${conversationId}/image-edit-mask/`, {
      method: 'POST',
      body: formData,
      fallbackMessage: 'Failed to upload the edit mask',
    });
    return json?.data;
  },

  dispatchSubmission: async (
    runId: string,
    payload: { clientSubmissionId: string; maskUrl?: string; retry?: boolean },
  ): Promise<AgentImageEditSubmissionRecord> => {
    const json = await apiRequest(`/api/agent/image-edit-submissions/${runId}/dispatch/`, {
      method: 'POST',
      body: {
        client_submission_id: payload.clientSubmissionId,
        ...(payload.maskUrl ? { mask_url: payload.maskUrl } : {}),
        ...(payload.retry ? { retry: true } : {}),
      },
      fallbackMessage: 'Failed to dispatch the image edit',
    });
    return json?.data;
  },

  listSubmissions: async (conversationId: string): Promise<AgentImageEditSubmissionRecord[]> => {
    const json = await apiRequest(`/api/agent/conversations/${conversationId}/image-edit-submissions/`, {
      fallbackMessage: 'Failed to restore image edit submissions',
    });
    return Array.isArray(json?.data?.submissions) ? json.data.submissions : [];
  },
};
