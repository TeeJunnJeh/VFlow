import React from 'react';
import { agentApi, type AgentMessage } from '../../services/agent';
import { useLanguage } from '../../context/LanguageContext';

export const AgentView: React.FC = () => {
  const { t } = useLanguage();
  const [messages, setMessages] = React.useState<AgentMessage[]>([
    {
      role: 'assistant',
      content: t.agent_welcome,
    },
  ]);
  const [input, setInput] = React.useState('');
  const [isSending, setIsSending] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, isSending]);

  const historyForApi = React.useMemo(() => {
    // Keep a small window to reduce tokens.
    const trimmed = messages.slice(-10);
    // Remove the initial hello if the user has started chatting.
    return trimmed;
  }, [messages]);

  const send = async () => {
    const content = input.trim();
    if (!content || isSending) return;

    setInput('');
    setIsSending(true);

    setMessages((prev) => [...prev, { role: 'user', content }]);

    try {
      const { reply } = await agentApi.chat({
        message: content,
        history: historyForApi,
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (err: any) {
      const msg = err?.message ? String(err.message) : t.agent_err_failed;
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `${t.agent_err_failed}：${msg}`,
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-6 py-5 border-b border-white/5 bg-zinc-950/30">
        <div className="text-lg font-semibold text-zinc-100">Agent</div>
        <div className="text-xs text-zinc-400 mt-1">
          {t.agent_subtitle}
        </div>
      </div>

      <div ref={listRef} className="flex-1 min-h-0 overflow-auto custom-scroll px-6 py-6 space-y-4">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`max-w-[860px] whitespace-pre-wrap text-sm leading-6 ${
              m.role === 'user' ? 'ml-auto text-zinc-100' : 'mr-auto text-zinc-200'
            }`}
          >
            <div
              className={
                m.role === 'user'
                  ? 'bg-orange-500/10 border border-orange-500/20 rounded-2xl px-4 py-3'
                  : 'bg-zinc-900/40 border border-white/5 rounded-2xl px-4 py-3'
              }
            >
              {m.content}
            </div>
          </div>
        ))}

        {isSending && (
          <div className="max-w-[860px] mr-auto text-zinc-200">
            <div className="bg-zinc-900/40 border border-white/5 rounded-2xl px-4 py-3 text-sm">
              {t.agent_status_thinking}
            </div>
          </div>
        )}
      </div>

      <div className="px-6 py-4 border-t border-white/5 bg-zinc-950/30">
        <div className="flex gap-3 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={t.agent_placeholder}
            className="flex-1 resize-none rounded-xl bg-zinc-900/60 border border-white/10 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
            rows={2}
          />
          <button
            onClick={() => void send()}
            disabled={isSending || !input.trim()}
            className="h-[44px] px-5 rounded-xl bg-orange-500 text-black text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-orange-400 transition"
          >
            {t.agent_btn_send}
          </button>
        </div>
        <div className="mt-2 text-[11px] text-zinc-500">{t.agent_input_tip}</div>
      </div>
    </div>
  );
};
