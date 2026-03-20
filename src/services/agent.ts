// src/services/agent.ts

const API_BASE_URL = '/api/auth';

// Helper to get CSRF token
function getCookie(name: string) {
  let cookieValue = null;
  if (document.cookie && document.cookie !== '') {
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      if (cookie.substring(0, name.length + 1) === (name + '=')) {
        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
        break;
      }
    }
  }
  return cookieValue;
}

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

async function readApiError(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      const json = (await response.json()) as AgentChatResponse & Record<string, unknown>;
      const msg = (json && (json.error || json.message)) || null;
      if (typeof msg === 'string' && msg.trim()) return msg.trim();
      return 'Request failed';
    } catch {
      // fall back to plain text
    }
  }

  try {
    const text = await response.text();
    const compact = text.replace(/\s+/g, ' ').trim();
    return compact ? compact.slice(0, 200) : 'Request failed';
  } catch {
    // ignore
  }

  return response.statusText || 'Request failed';
}

export const agentApi = {
  getSkills: async () => {
    const response = await fetch(`${API_BASE_URL}/agent/skills/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const msg = await readApiError(response);
      throw new Error(msg);
    }

    const json = (await response.json()) as AgentChatResponse;
    const skills = json?.data?.skills;
    return Array.isArray(skills) ? skills : [];
  },

  chat: async (payload: { message: string; history?: AgentMessage[]; attachments?: AgentAttachment[] }) => {
    const csrftoken = getCookie('csrftoken');

    const response = await fetch(`${API_BASE_URL}/agent/chat/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken || '',
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const msg = await readApiError(response);
      throw new Error(msg);
    }

    const json = (await response.json()) as AgentChatResponse;
    const reply = json?.data?.reply;
    if (typeof reply !== 'string') {
      throw new Error('Agent response is missing reply');
    }
    return { reply };
  },
};
