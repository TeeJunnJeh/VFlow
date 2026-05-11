/**
 * Agent Sidebar — LibTV-style chat that drives the canvas.
 *
 * Flow:
 *   - User types a message → POST /api/canvas/sessions/
 *   - Backend appends user msg + parses an assistant CanvasAction
 *   - We refresh the message list and apply the assistant's action to the
 *     local canvas via the `onApplyAction` callback (e.g. `magic_compose`
 *     triggers the existing MagicCompose handler).
 *
 * This MVP does not stream; it round-trips on each send because the action
 * parser is synchronous. When we swap in an LLM-backed parser, we can add
 * incremental polling with `after_seq`.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Loader2, X, Sparkles, Wand2 } from 'lucide-react';
import { canvasAgentApi, type CanvasAgentAction, type CanvasAgentMessage } from '../../../../services/canvasAgent';

interface AgentSidebarProps {
  open: boolean;
  onClose: () => void;
  onApplyAction: (action: CanvasAgentAction) => void;
}

export const AgentSidebar: React.FC<AgentSidebarProps> = ({ open, onClose, onApplyAction }) => {
  const [messages, setMessages] = useState<CanvasAgentMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);

    // Optimistic user bubble
    const optimisticSeq = (messages[messages.length - 1]?.seq || 0) + 1;
    setMessages((prev) => [
      ...prev,
      {
        seq: optimisticSeq,
        role: 'user',
        content: { text },
        action: null,
        created_at: new Date().toISOString(),
      },
    ]);
    setInput('');

    try {
      const result = await canvasAgentApi.sendMessage({
        message: text,
        sessionId: sessionId || undefined,
      });
      const nextSessionId = result.session.session_id;
      setSessionId(nextSessionId);

      // Pull all messages so far (server is source of truth for seqs)
      const fresh = await canvasAgentApi.getMessages(nextSessionId, 0);
      setMessages(fresh.messages);

      // Apply the latest assistant action to the canvas, if any
      const latestAssistant = [...fresh.messages].reverse().find((m) => m.role === 'assistant');
      if (latestAssistant?.action && latestAssistant.action.op !== 'echo') {
        onApplyAction(latestAssistant.action);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Send failed';
      setError(msg);
    } finally {
      setSending(false);
    }
  }, [input, sending, sessionId, messages, onApplyAction]);

  const handleNewSession = useCallback(() => {
    setSessionId(null);
    setMessages([]);
    setError(null);
  }, []);

  if (!open) return null;

  return (
    <div className="absolute top-0 right-0 bottom-0 z-30 w-[360px] bg-zinc-900/95 backdrop-blur-md border-l border-white/10 flex flex-col shadow-2xl shadow-black/40">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-orange-400" />
          <h3 className="text-sm font-semibold text-zinc-200">Canvas Agent</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleNewSession}
            className="px-2 py-1 rounded text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
            title="New session"
          >
            New
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/5 text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Message list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 custom-scroll">
        {messages.length === 0 && (
          <div className="text-center py-6 text-[11px] text-zinc-500 leading-relaxed">
            Ask the agent to compose a short film, add a node, or analyze a video.
            <br />
            <span className="text-zinc-600">e.g. "做一个 5 秒冰丝 T 恤广告"</span>
          </div>
        )}

        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div key={msg.seq} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[280px] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                  isUser
                    ? 'bg-orange-500/15 border border-orange-500/30 text-zinc-100'
                    : 'bg-zinc-800/60 border border-white/5 text-zinc-200'
                }`}
              >
                <div className="whitespace-pre-wrap">{String(msg.content?.text || '')}</div>
                {msg.action && msg.action.op !== 'echo' && (
                  <div className="mt-1.5 pt-1.5 border-t border-white/10 flex items-center gap-1 text-[10px] text-emerald-300">
                    <Wand2 className="w-3 h-3" />
                    <span className="font-medium">{msg.action.op}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {sending && (
          <div className="flex justify-start">
            <div className="bg-zinc-800/60 border border-white/5 rounded-xl px-3 py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
            </div>
          </div>
        )}

        {error && (
          <div className="text-[11px] text-red-400 px-2 py-1.5 bg-red-500/10 border border-red-500/20 rounded">
            {error}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-white/5 p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Tell the agent what to do..."
            rows={2}
            className="flex-1 px-2.5 py-1.5 text-xs bg-zinc-800 border border-white/10 rounded-md text-zinc-200 resize-none focus:outline-none focus:border-orange-500/40"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="p-2 rounded-md disabled:opacity-40 disabled:cursor-not-allowed bg-orange-500 hover:bg-orange-400 text-white transition-colors"
          >
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
};
