import React, { useState, useRef, useEffect } from 'react';
import { Send, Wand2, Film, FileText, Image as ImageIcon, Shirt, Sparkles, Loader2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { aiCreatorApi, type AiCreatorAction, type AiCreatorMessage } from '../../services/aiCreator';
import { videoApi } from '../../services/video';
import { AppDialog } from '../common/AppDialog';

const ACTION_ICONS: Record<string, React.ReactNode> = {
  generate_video: <Film className="w-5 h-5" />,
  generate_script: <FileText className="w-5 h-5" />,
  generate_image: <ImageIcon className="w-5 h-5" />,
  generate_first_frame: <ImageIcon className="w-5 h-5" />,
  clothing_swap: <Shirt className="w-5 h-5" />,
  chat: <Sparkles className="w-5 h-5" />,
};

const ACTION_LABELS_EN: Record<string, string> = {
  generate_video: 'Generate Video',
  generate_script: 'Generate Script',
  generate_image: 'Generate Image',
  generate_first_frame: 'Generate First Frame',
  clothing_swap: 'Clothing Swap',
  chat: 'Chat',
};

const ACTION_LABELS_ZH: Record<string, string> = {
  generate_video: '生成视频',
  generate_script: '生成脚本',
  generate_image: '生成图片',
  generate_first_frame: '生成首帧图',
  clothing_swap: 'AI 换装',
  chat: '对话',
};

export const AICreatorView: React.FC = () => {
  const { t } = useLanguage();
  const [messages, setMessages] = useState<AiCreatorMessage[]>([
    {
      role: 'assistant',
      content:
        (t as any).ai_creator_welcome ||
        "👋 Hi! I'm your AI Creator. Just tell me what you want to make — a video, a script, an image, or anything else — and I'll generate it for you with one click.",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogMessage, setDialogMessage] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const openInfo = (title: string, message: string) => {
    setDialogTitle(title);
    setDialogMessage(message);
    setDialogOpen(true);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: AiCreatorMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const history = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await aiCreatorApi.chat(text, history);
      const assistantMsg: AiCreatorMessage = {
        role: 'assistant',
        content: res.reply,
        action: res.action || null,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      openInfo(
        (t as any).ai_creator_title || 'AI Creator',
        err?.message || (t as any).ai_creator_error || 'Something went wrong. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const executeAction = async (action: AiCreatorAction) => {
    if (generating) return;
    setGenerating(true);

    try {
      const type = action.type;
      const params = action.params || {};

      if (type === 'generate_video') {
        const payload = {
          prompt: String(params.prompt || ''),
          model: String(params.model || 'kling'),
          duration: Number(params.duration || 5),
          aspect_ratio: String(params.aspect_ratio || '9:16'),
          sound: String(params.sound || 'none'),
        };
        const res = await videoApi.generate(payload);
        if (res?.code === 0) {
          openInfo(
            (t as any).ai_creator_title || 'AI Creator',
            (t as any).ai_creator_video_queued || 'Video generation started! You can check progress in the task queue or Workbench.'
          );
        } else {
          throw new Error(res?.message || 'Video generation failed');
        }
      } else if (type === 'generate_script') {
        // Script generation needs user_id — get from auth context is not available here directly,
        // so we use a simpler approach: navigate to workbench and let user trigger it there,
        // or we can call the guest endpoint if available.
        openInfo(
          (t as any).ai_creator_title || 'AI Creator',
          (t as any).ai_creator_script_tip ||
            `Script suggestion ready: "${params.product_name || params.prompt || ''}". Please go to Workbench → Script tab to generate with one click.`
        );
      } else if (type === 'generate_image') {
        const payload = {
          project_id: '', // will be created by backend if empty in some flows; but image fusion needs project_id
          image_paths: [],
          prompt: String(params.prompt || ''),
          aspect_ratio: String(params.aspect_ratio || '9:16'),
          resolution: String(params.resolution || '1K'),
        };
        // Image fusion technically requires a project_id; we'll open a dialog directing user
        openInfo(
          (t as any).ai_creator_title || 'AI Creator',
          (t as any).ai_creator_image_tip ||
            `Image prompt ready: "${payload.prompt}". Please go to Product Images → Gallery to generate with this prompt.`
        );
      } else if (type === 'generate_first_frame') {
        openInfo(
          (t as any).ai_creator_title || 'AI Creator',
          (t as any).ai_creator_first_frame_tip ||
            `First-frame prompt ready: "${params.prompt || ''}". Please go to Product Images → First Frame to generate.`
        );
      } else if (type === 'clothing_swap') {
        openInfo(
          (t as any).ai_creator_title || 'AI Creator',
          (t as any).ai_creator_clothing_swap_tip || 'Please go to Product Images → Clothing Swap to upload your garment and model images.'
        );
      } else {
        openInfo(
          (t as any).ai_creator_title || 'AI Creator',
          (t as any).ai_creator_unsupported || 'This feature is not yet supported for one-click generation. Please use the dedicated page.'
        );
      }
    } catch (err: any) {
      openInfo(
        (t as any).ai_creator_title || 'AI Creator',
        err?.message || (t as any).ai_creator_error || 'Generation failed. Please try again.'
      );
    } finally {
      setGenerating(false);
    }
  };

  const getActionLabel = (type: string) => {
    const isZh = (t as any).ai_creator_title === 'AI 创作助手' || document?.documentElement?.lang?.startsWith('zh');
    const map = isZh ? ACTION_LABELS_ZH : ACTION_LABELS_EN;
    return map[type] || type;
  };

  return (
    <div className="flex flex-col h-full z-10 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <header className="flex justify-between items-center px-10 py-6 border-b border-white/5 shrink-0 bg-black/20 backdrop-blur-sm relative z-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
            {(t as any).ai_creator_title || 'AI Creator'}
          </h1>
          <p className="text-zinc-500 text-xs mt-1">
            {(t as any).ai_creator_subtitle || 'Describe anything and generate with one click'}
          </p>
        </div>
        <div className="px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/40 text-xs text-orange-400 font-semibold flex items-center gap-1">
          <Sparkles className="w-3 h-3" />
          AI
        </div>
      </header>

      {/* Chat area */}
      <main className="flex-1 overflow-y-auto px-10 py-6 space-y-6">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-5 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-orange-600 text-white'
                  : 'bg-zinc-900 border border-white/10 text-zinc-200'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>

              {/* Action card */}
              {msg.role === 'assistant' && msg.action && msg.action.type !== 'chat' && (
                <div className="mt-3 pt-3 border-t border-white/10">
                  <div className="flex items-center gap-2 text-xs text-zinc-400 mb-2">
                    {ACTION_ICONS[msg.action.type] || <Wand2 className="w-4 h-4" />}
                    <span className="font-semibold text-zinc-300">{getActionLabel(msg.action.type)}</span>
                  </div>
                  {msg.action.params && Object.keys(msg.action.params).length > 0 && (
                    <div className="text-[11px] text-zinc-500 mb-2 space-y-0.5">
                      {Object.entries(msg.action.params).map(([k, v]) => (
                        <div key={k}>
                          <span className="text-zinc-400">{k}:</span> {String(v)}
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => executeAction(msg.action!)}
                    disabled={generating}
                    className="mt-1 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-600 text-xs text-white font-semibold hover:bg-orange-500 transition disabled:opacity-50"
                  >
                    {generating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Wand2 className="w-3.5 h-3.5" />
                    )}
                    {(t as any).ai_creator_generate || 'Generate'}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-zinc-900 border border-white/10 rounded-2xl px-5 py-3 text-sm text-zinc-400 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
              {(t as any).ai_creator_thinking || 'Thinking...'}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      {/* Input area */}
      <footer className="shrink-0 px-10 py-4 border-t border-white/5 bg-zinc-950/50 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={(t as any).ai_creator_placeholder || 'Describe what you want to generate...'}
            disabled={loading}
            className="flex-1 px-4 py-3 rounded-xl bg-zinc-900 border border-white/10 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-orange-500 transition disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="px-4 py-3 rounded-xl bg-orange-600 text-white hover:bg-orange-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </footer>

      {/* Dialog */}
      {dialogOpen && (
        <AppDialog
          isOpen={dialogOpen}
          title={dialogTitle || 'Notice'}
          onClose={() => setDialogOpen(false)}
          footer={
            <button
              className="bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-700"
              onClick={() => setDialogOpen(false)}
            >
              {t.btn_ok || 'OK'}
            </button>
          }
        >
          <div className="whitespace-pre-line text-sm text-zinc-300">{dialogMessage}</div>
        </AppDialog>
      )}
    </div>
  );
};
