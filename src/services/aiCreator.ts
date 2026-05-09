// src/services/aiCreator.ts

import { apiRequest } from './apiClient';

export type AiCreatorActionType =
  | 'generate_video'
  | 'generate_script'
  | 'generate_image'
  | 'generate_first_frame'
  | 'clothing_swap'
  | 'chat';

export interface AiCreatorAction {
  type: AiCreatorActionType;
  params?: Record<string, unknown>;
}

export interface AiCreatorMessage {
  role: 'user' | 'assistant';
  content: string;
  action?: AiCreatorAction | null;
  created_at?: string;
}

export interface AiCreatorConversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface AiCreatorChatResponse {
  reply: string;
  action?: AiCreatorAction | null;
  conversation_id?: string;
}

export const aiCreatorApi = {
  chat: async (
    message: string,
    history?: { role: 'user' | 'assistant'; content: string }[],
    conversationId?: string
  ): Promise<AiCreatorChatResponse> => {
    const json = await apiRequest('/api/projects/ai-creator/chat/', {
      method: 'POST',
      body: { message, history, conversation_id: conversationId },
      fallbackMessage: 'AI Creator failed',
    });
    const data = json?.data;
    return {
      reply: data?.reply || '',
      action: data?.action || null,
      conversation_id: data?.conversation_id,
    };
  },

  generateImage: async (payload: {
    prompt: string;
    aspect_ratio?: string;
    resolution?: string;
  }) => {
    return apiRequest('/api/projects/generate_image/', {
      method: 'POST',
      body: payload,
      fallbackMessage: 'Image generation failed',
    });
  },

  // Conversation history APIs
  listConversations: async (): Promise<AiCreatorConversation[]> => {
    const json = await apiRequest('/api/projects/ai-creator/conversations/', {
      method: 'GET',
      fallbackMessage: 'Failed to load conversations',
    });
    return json?.data || [];
  },

  createConversation: async (title?: string): Promise<AiCreatorConversation> => {
    const json = await apiRequest('/api/projects/ai-creator/conversations/create/', {
      method: 'POST',
      body: title ? { title } : {},
      fallbackMessage: 'Failed to create conversation',
    });
    return json?.data;
  },

  deleteConversation: async (id: string): Promise<void> => {
    await apiRequest(`/api/projects/ai-creator/conversations/${id}/`, {
      method: 'DELETE',
      fallbackMessage: 'Failed to delete conversation',
    });
  },

  updateConversation: async (id: string, title: string): Promise<AiCreatorConversation> => {
    const json = await apiRequest(`/api/projects/ai-creator/conversations/${id}/update/`, {
      method: 'PATCH',
      body: { title },
      fallbackMessage: 'Failed to update conversation',
    });
    return json?.data;
  },

  getMessages: async (id: string): Promise<{ id: string; title: string; messages: AiCreatorMessage[] }> => {
    const json = await apiRequest(`/api/projects/ai-creator/conversations/${id}/messages/`, {
      method: 'GET',
      fallbackMessage: 'Failed to load messages',
    });
    return json?.data;
  },
};
