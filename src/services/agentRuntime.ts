import { apiRequest, getCookie } from './apiClient';
import { ApiError, apiErrorFromPayload, parseApiError } from './errors';

export type AgentActionType =
  | 'generate_script'
  | 'generate_image'
  | 'generate_first_frame'
  | 'generate_video'
  | 'generate_clothing_swap'
  | 'generate_ai_model'
  | 'generate_product_gallery'
  | 'edit_product_poster'
  | 'clothing_swap'
  | 'chat';

export interface AgentAction {
  type: AgentActionType;
  params?: Record<string, unknown>;
  run_id?: string;
}

export interface AgentAttachment {
  url: string;
  name?: string;
  media_kind: 'image' | 'video' | 'document' | string;
  role?: 'product_image' | 'reference_image' | 'model_image' | 'real_person_image' | 'garment_image' | 'background_image' | 'video_reference' | 'document' | string;
  asset_id?: string;
}

export interface AgentAssetRef {
  source: 'conversation' | 'library' | 'temp_upload';
  url: string;
  name?: string;
  role?: string;
  message_id?: string;
  asset_id?: string;
}

export interface AgentSkill {
  source: 'system';
  id?: string;
  name: string;
  version?: string;
  label: string;
  description?: string;
  trigger_actions?: string[];
}

export interface AgentExperienceRecipe {
  source: 'experience_recipe';
  recipe_kind: 'run_experience' | 'seed_skill';
  id: string;
  name: string;
  title?: string;
  label: string;
  description?: string;
  tool_name?: string;
  content?: string;
  params_template?: Record<string, any>;
  tags?: string[];
  usage_count?: number;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export type AgentRequestedHint = AgentSkill | AgentExperienceRecipe;

export interface AgentMessage {
  id?: string;
  stream_key?: string;
  role: 'user' | 'assistant' | 'developer' | 'tool' | 'event';
  content: string;
  attachments?: AgentAttachment[];
  action?: AgentAction | null;
  metadata?: Record<string, any>;
  tool_result?: {
    run_id: string;
    step_id: number;
    tool_name: string;
    status: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';
    display_type?: string;
    assets?: Array<Record<string, any>>;
    task_ids?: Array<string | number>;
    project_id?: string;
    error_message?: string;
    data?: Record<string, any>;
  } | null;
  run_id?: string | null;
  run_status?: AgentRunStatus | null;
  run_finish_reason?: string | null;
  created_at?: string;
}

export interface AgentConversation {
  id: string;
  title: string;
  summary?: string;
  context_usage?: AgentContextUsage;
  created_at: string;
  updated_at: string;
}

export interface AgentContextUsage {
  input_tokens: number;
  max_tokens: number;
  checkpoint_threshold: number;
  epoch: number;
}

export interface AgentStep {
  id: number;
  index: number;
  tool_name: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';
  input_payload: Record<string, unknown>;
  output_payload: Record<string, any>;
  error_message?: string;
  external_task_id?: string;
  project_id?: string;
}

export type AgentRunStatus = 'pending' | 'running' | 'waiting_confirmation' | 'succeeded' | 'failed' | 'cancelled';

export interface AgentRunReadiness {
  can_confirm: boolean;
  missing_fields: string[];
}

export interface AgentRun {
  id: string;
  conversation_id: string;
  status: AgentRunStatus;
  plan: Array<Record<string, unknown>>;
  output_payload?: Record<string, any>;
  error_message?: string;
  requires_confirmation: boolean;
  readiness?: AgentRunReadiness | null;
  steps: AgentStep[];
}

export interface AgentProductAnalysisResult {
  product_name: string;
  product_category: string;
  core_selling_points: string[];
}

export interface AgentChatResponse {
  reply: string;
  action?: AgentAction | null;
  conversation_id?: string;
  message?: AgentMessage;
  messages?: AgentMessage[];
  run?: AgentRun | null;
}

export type AgentStreamPhase =
  | 'thinking'
  | 'iteration_started'
  | 'iteration_finished'
  | 'searching_recipes'
  | 'retrieving_recipes'
  | 'loading_skill'
  | 'preparing_action'
  | 'responding';

export interface AgentStreamStatus {
  stream_id: string;
  stream_key?: string;
  phase: AgentStreamPhase;
  action_type?: string;
  planner_iteration?: number;
  has_tool_calls?: boolean;
}

export interface AgentAssistantDelta {
  stream_id: string;
  stream_key: string;
  delta: string;
}

export type AgentChatStreamHandlers = {
  onConversation?: (data: { conversation_id?: string; conversation?: AgentConversation; stream_id?: string }) => void;
  onStatus?: (status: AgentStreamStatus) => void;
  onContextUsage?: (usage: AgentContextUsage) => void;
  onDelta?: (delta: AgentAssistantDelta) => void;
  onDiscard?: (data: { stream_id: string; stream_key: string }) => void;
  onMessage?: (message: AgentMessage) => void;
  onDone?: (data: AgentChatResponse) => void;
};

export interface AgentChatStreamOptions {
  signal?: AbortSignal;
}

export type AgentSuggestionLanguage = 'en' | 'zh' | 'ms' | 'vi' | 'ko';

export interface AgentNextSuggestion {
  status: 'ready' | 'processing';
  suggestion: string | null;
  source: 'model' | 'fallback' | 'none';
  stage: string | null;
  can_apply: boolean;
}

export interface AgentReferencePrompt {
  status: 'ready';
  prompt: string;
  source: 'model';
  analyzed_image_count: number;
}

export interface AgentTool {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  defaults: Record<string, unknown>;
  requires_confirmation: boolean;
  estimated_cost: string;
}

export const agentRuntimeApi = {
  listConversations: async (): Promise<AgentConversation[]> => {
    const json = await apiRequest('/api/agent/conversations/', {
      method: 'GET',
      fallbackMessage: 'Failed to load conversations',
    });
    return json?.data || [];
  },

  createConversation: async (title?: string): Promise<AgentConversation> => {
    const json = await apiRequest('/api/agent/conversations/', {
      method: 'POST',
      body: title ? { title } : {},
      fallbackMessage: 'Failed to create conversation',
    });
    return json?.data;
  },

  updateConversation: async (id: string, title: string): Promise<AgentConversation> => {
    const json = await apiRequest(`/api/agent/conversations/${id}/`, {
      method: 'PATCH',
      body: { title },
      fallbackMessage: 'Failed to update conversation',
    });
    return json?.data;
  },

  deleteConversation: async (id: string): Promise<void> => {
    await apiRequest(`/api/agent/conversations/${id}/`, {
      method: 'DELETE',
      fallbackMessage: 'Failed to delete conversation',
    });
  },

  getMessages: async (id: string): Promise<AgentConversation & { messages: AgentMessage[] }> => {
    const json = await apiRequest(`/api/agent/conversations/${id}/messages/`, {
      method: 'GET',
      fallbackMessage: 'Failed to load messages',
    });
    return json?.data;
  },

  getNextSuggestion: async (
    id: string,
    language: AgentSuggestionLanguage,
    options: { signal?: AbortSignal } = {},
  ): Promise<AgentNextSuggestion> => {
    const json = await apiRequest(`/api/agent/conversations/${id}/next-suggestion/`, {
      method: 'POST',
      body: { language },
      fallbackMessage: 'Failed to load the next suggestion',
      fetchOptions: { signal: options.signal },
    });
    const data = json?.data || {};
    return {
      status: data.status === 'processing' ? 'processing' : 'ready',
      suggestion: typeof data.suggestion === 'string' ? data.suggestion : null,
      source: data.source === 'model' || data.source === 'fallback' ? data.source : 'none',
      stage: typeof data.stage === 'string' ? data.stage : null,
      can_apply: data.can_apply !== false && typeof data.suggestion === 'string',
    };
  },

  analyzeProductImages: async (
    conversationId: string,
    payload: {
      run_id: string;
      language: AgentSuggestionLanguage;
      product_images: AgentAssetRef[];
      existing_info: {
        product_name?: string;
        product_category?: string;
        core_selling_points?: string[];
      };
    },
    options: { signal?: AbortSignal } = {},
  ): Promise<AgentProductAnalysisResult> => {
    const json = await apiRequest(`/api/agent/conversations/${conversationId}/product-image-analysis/`, {
      method: 'POST',
      body: payload,
      fallbackMessage: 'Failed to recognize product information',
      fetchOptions: { signal: options.signal },
    });
    const data = json?.data || {};
    return {
      product_name: String(data.product_name || ''),
      product_category: String(data.product_category || ''),
      core_selling_points: Array.isArray(data.core_selling_points)
        ? data.core_selling_points.map((item: unknown) => String(item || '').trim()).filter(Boolean).slice(0, 5)
        : [],
    };
  },

  createReferencePrompt: async (
    id: string,
    payload: {
      language: AgentSuggestionLanguage;
      image_urls: string[];
      role: string;
      draft?: string;
    },
    options: { signal?: AbortSignal } = {},
  ): Promise<AgentReferencePrompt> => {
    const json = await apiRequest(`/api/agent/conversations/${id}/reference-prompt/`, {
      method: 'POST',
      body: payload,
      fallbackMessage: 'Failed to analyze reference images',
      fetchOptions: { signal: options.signal },
    });
    return json?.data;
  },

  truncateMessages: async (conversationId: string, messageId: string): Promise<void> => {
    await apiRequest(`/api/agent/conversations/${conversationId}/messages/truncate/`, {
      method: 'POST',
      body: { message_id: messageId },
      fallbackMessage: 'Failed to update conversation history',
    });
  },

  chat: async (payload: {
    message: string;
    conversation_id?: string;
    attachments?: AgentAttachment[];
    requested_hints?: AgentRequestedHint[];
    retry_turn_id?: string;
  }): Promise<AgentChatResponse> => {
    const json = await apiRequest('/api/agent/chat/', {
      method: 'POST',
      body: payload,
      fallbackMessage: 'Agent chat failed',
    });
    const data = json?.data || {};
    return {
      reply: data.reply || '',
      action: data.action || null,
      conversation_id: data.conversation_id,
      message: data.message,
      messages: Array.isArray(data.messages) ? data.messages : undefined,
      run: data.run || null,
    };
  },

  chatStream: async (
    payload: {
      message: string;
      conversation_id?: string;
      attachments?: AgentAttachment[];
      requested_hints?: AgentRequestedHint[];
      retry_turn_id?: string;
    },
    handlers: AgentChatStreamHandlers = {},
    options: AgentChatStreamOptions = {},
  ): Promise<AgentChatResponse> => {
    const headers: Record<string, string> = {
      'Accept': 'text/event-stream',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Requested-With': 'XMLHttpRequest',
    };
    const csrftoken = getCookie('csrftoken');
    if (csrftoken) headers['X-CSRFToken'] = csrftoken;

    const response = await fetch('/api/agent/chat/stream/', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(payload),
      signal: options.signal,
    });
    if (!response.ok) {
      throw await parseApiError(response, 'Agent chat failed');
    }
    if (!response.body) {
      throw new ApiError('Agent stream is not readable', { status: response.status });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let donePayload: AgentChatResponse | null = null;

    const handleBlock = (block: string) => {
      const lines = block.split(/\r?\n/);
      let eventName = 'message';
      const dataLines: string[] = [];
      lines.forEach((line) => {
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim() || 'message';
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trimStart());
        }
      });
      if (dataLines.length === 0) return;
      const data = JSON.parse(dataLines.join('\n'));
      if (eventName === 'conversation') {
        handlers.onConversation?.(data);
      } else if (eventName === 'status') {
        handlers.onStatus?.(data as AgentStreamStatus);
      } else if (eventName === 'context_usage') {
        handlers.onContextUsage?.((data.context_usage || {}) as AgentContextUsage);
      } else if (eventName === 'assistant_delta') {
        handlers.onDelta?.(data as AgentAssistantDelta);
      } else if (eventName === 'assistant_discard') {
        handlers.onDiscard?.(data as { stream_id: string; stream_key: string });
      } else if (eventName === 'message') {
        handlers.onMessage?.(data as AgentMessage);
      } else if (eventName === 'done') {
        donePayload = {
          reply: data.reply || '',
          action: data.action || null,
          conversation_id: data.conversation_id,
          message: data.message,
          messages: Array.isArray(data.messages) ? data.messages : undefined,
          run: data.run || null,
        };
        handlers.onDone?.(donePayload);
      } else if (eventName === 'error') {
        throw apiErrorFromPayload(data, 'Agent stream failed', 200);
      }
    };

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (value) {
          buffer += decoder.decode(value, { stream: true });
        }
        if (done) {
          buffer += decoder.decode();
        }
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() || '';
        blocks.forEach((block) => {
          if (block.trim()) handleBlock(block);
        });
        if (done) break;
      }
    } finally {
      reader.releaseLock();
    }
    if (buffer.trim()) handleBlock(buffer);
    if (!donePayload) {
      throw new Error('Agent stream ended before completion');
    }
    return donePayload;
  },

  confirmRun: async (id: string, params?: Record<string, unknown>): Promise<AgentRun> => {
    const json = await apiRequest(`/api/agent/runs/${id}/confirm/`, {
      method: 'POST',
      body: params ? { params } : {},
      fallbackMessage: 'Failed to execute agent run',
    });
    return json?.data;
  },

  getRun: async (id: string): Promise<AgentRun> => {
    const json = await apiRequest(`/api/agent/runs/${id}/`, {
      method: 'GET',
      fallbackMessage: 'Failed to load run',
    });
    return json?.data;
  },

  updateRun: async (id: string, params: Record<string, unknown>): Promise<AgentRun> => {
    const json = await apiRequest(`/api/agent/runs/${id}/`, {
      method: 'PATCH',
      body: { params },
      fallbackMessage: 'Failed to update agent run',
    });
    return json?.data;
  },

  listTools: async (): Promise<AgentTool[]> => {
    const json = await apiRequest('/api/agent/tools/', {
      method: 'GET',
      fallbackMessage: 'Failed to load tools',
    });
    return json?.data || [];
  },

  listSkills: async (): Promise<{ system_skills: AgentSkill[]; experience_recipes: AgentExperienceRecipe[] }> => {
    const json = await apiRequest('/api/agent/skills/', {
      method: 'GET',
      fallbackMessage: 'Failed to load skills',
    });
    const data = json?.data || {};
    return {
      system_skills: Array.isArray(data.system_skills) ? data.system_skills : [],
      experience_recipes: Array.isArray(data.experience_recipes) ? data.experience_recipes : [],
    };
  },

  listExperienceRecipes: async (): Promise<AgentExperienceRecipe[]> => {
    const json = await apiRequest('/api/agent/experience-recipes/', {
      method: 'GET',
      fallbackMessage: 'Failed to load experience recipes',
    });
    return json?.data || [];
  },

  saveExperienceRecipe: async (payload:
    | { run_id: string; name?: string; description?: string }
    | { seed_skill_workflow_id: string }
  ): Promise<AgentExperienceRecipe> => {
    const json = await apiRequest('/api/agent/experience-recipes/', {
      method: 'POST',
      body: payload,
      fallbackMessage: 'Failed to save experience recipe',
    });
    return json?.data;
  },

  updateExperienceRecipe: async (id: string, payload: { is_active?: boolean }): Promise<AgentExperienceRecipe> => {
    const json = await apiRequest(`/api/agent/experience-recipes/${id}/`, {
      method: 'PATCH',
      body: payload,
      fallbackMessage: 'Failed to update experience recipe',
    });
    return json?.data;
  },

  saveWorkflowSkill: async (payload: {
    run_id: string;
    name?: string;
    description?: string;
    trigger_examples?: string[];
  }): Promise<{ id: string; name: string; steps: Array<Record<string, unknown>> }> => {
    const json = await apiRequest('/api/agent/workflow-skills/', {
      method: 'POST',
      body: payload,
      fallbackMessage: 'Failed to save workflow',
    });
    return json?.data;
  },
};
