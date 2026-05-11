/**
 * Canvas Agent API client — LibTV-style session interface.
 *
 * Cookie-authenticated (Django session). Bearer-token agent path for external
 * automation can be layered on later without changing the wire shape.
 */
import { apiRequest } from './apiClient';

export interface CanvasAgentAction {
  op: 'magic_compose' | 'add_node' | 'echo' | string;
  params: Record<string, unknown>;
}

export interface CanvasAgentMessage {
  seq: number;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: { text?: string; [key: string]: unknown };
  action: CanvasAgentAction | null;
  created_at: string;
}

export interface CanvasAgentSession {
  session_id: string;
  project_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  project_url?: string;
}

const API_BASE = '/api/canvas';

export const canvasAgentApi = {
  /**
   * Create a new session OR append a user message to an existing one.
   * Returns updated session metadata and the seq of the last (assistant) message.
   */
  async sendMessage(payload: { message: string; sessionId?: string; projectId?: string }): Promise<{
    session: CanvasAgentSession;
    last_seq: number;
  }> {
    const body: Record<string, unknown> = { message: payload.message };
    if (payload.sessionId) body.session_id = payload.sessionId;
    if (payload.projectId) body.project_id = payload.projectId;

    const resp = await apiRequest<{ data: { session: CanvasAgentSession; last_seq: number } }>(
      `${API_BASE}/sessions/`,
      {
        method: 'POST',
        body,
        fallbackMessage: 'Failed to send message',
      }
    );
    return resp.data;
  },

  async getMessages(sessionId: string, afterSeq = 0): Promise<{
    session: CanvasAgentSession;
    messages: CanvasAgentMessage[];
  }> {
    const resp = await apiRequest<{ data: { session: CanvasAgentSession; messages: CanvasAgentMessage[] } }>(
      `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/?after_seq=${afterSeq}`,
      { method: 'GET', fallbackMessage: 'Failed to fetch messages' }
    );
    return resp.data;
  },

  async listSessions(): Promise<CanvasAgentSession[]> {
    const resp = await apiRequest<{ data: { sessions: CanvasAgentSession[] } }>(
      `${API_BASE}/sessions/list/`,
      { method: 'GET', fallbackMessage: 'Failed to list sessions' }
    );
    return resp.data.sessions;
  },

  async listProjects(): Promise<Array<{ project_id: string; title: string; updated_at: string }>> {
    const resp = await apiRequest<{ data: { projects: Array<{ project_id: string; title: string; updated_at: string }> } }>(
      `${API_BASE}/projects/`,
      { method: 'GET', fallbackMessage: 'Failed to list projects' }
    );
    return resp.data.projects;
  },
};
