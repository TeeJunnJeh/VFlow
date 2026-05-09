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
}

export interface AiCreatorChatResponse {
  reply: string;
  action?: AiCreatorAction | null;
}

export const aiCreatorApi = {
  chat: async (
    message: string,
    history?: { role: 'user' | 'assistant'; content: string }[]
  ): Promise<AiCreatorChatResponse> => {
    const json = await apiRequest('/api/projects/ai-creator/chat/', {
      method: 'POST',
      body: { message, history },
      fallbackMessage: 'AI Creator failed',
    });
    const data = json?.data;
    return {
      reply: data?.reply || '',
      action: data?.action || null,
    };
  },
};
