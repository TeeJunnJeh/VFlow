// src/services/agent.ts

import { apiRequest } from './apiClient';

const API_BASE_URL = '/api/auth';

export type AgentRole = 'user' | 'assistant';

export type AgentMessage = {
  role: AgentRole;
  content: string;
};

export type AgentSkill = {
  id: string;
  name: string;
  command: string;
  description: string;
  guide?: string;
};

export type AgentAttachment = {
  name: string;
  url: string;
  media_kind: 'image' | 'video' | 'document' | 'audio' | 'file';
};

type AgentChatResponse = {
  message?: string;
  error?: string;
  data?: {
    reply?: string;
    skills?: AgentSkill[];
  };
};

export const agentApi = {
  getSkills: async () => {
    const json = await apiRequest<AgentChatResponse>(`${API_BASE_URL}/agent/skills/`, {
      fallbackMessage: 'Failed to load agent skills',
    });
    const skills = json?.data?.skills;
    return Array.isArray(skills) ? skills : [];
  },

  chat: async (payload: { message: string; history?: AgentMessage[]; attachments?: AgentAttachment[] }) => {
    const json = await apiRequest<AgentChatResponse>(`${API_BASE_URL}/agent/chat/`, {
      method: 'POST',
      body: payload,
      fallbackMessage: 'Agent chat request failed',
    });
    const reply = json?.data?.reply;
    if (typeof reply !== 'string') {
      throw new Error('Agent response is missing reply');
    }
    return { reply };
  },
};
