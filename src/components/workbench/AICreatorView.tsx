import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Wand2, Film, FileText, Image as ImageIcon, Shirt, Sparkles, Loader2, Play, ImagePlus, ScrollText } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
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

interface GenerationResult {
  id: string;
  type: string;
  status: 'pending' | 'success' | 'failed';
  content?: string;
  imageUrl?: string;
  videoUrl?: string;
  taskId?: number;
  error?: string;
}

export const AICreatorView: React.FC = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
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
  const [generatingType, setGeneratingType] = useState<string | null>(null);
  const [results, setResults] = useState<GenerationResult[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogMessage, setDialogMessage] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, results]);

  const openInfo = (title: string, message: string) => {
    setDialogTitle(title);
    setDialogMessage(message);
    setDialogOpen(true);
  };

  const getActionLabel = (type: string) => {
    const isZh = (t as any).ai_creator_title === 'AI 创作助手';
    const map = isZh ? ACTION_LABELS_ZH : ACTION_LABELS_EN;
    return map[type] || type;
  };

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText || input).trim();
    if (!text || loading) return;

    if (!overrideText) setInput('');

    const userMsg: AiCreatorMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
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

  const addResult = (result: GenerationResult) => {
    setResults((prev) => [...prev, result]);
  };

  const executeAction = async (action: AiCreatorAction) => {
    if (generatingType) return;
    const type = action.type;
    const params = action.params || {};
    setGeneratingType(type);

    const resultId = `${type}_${Date.now()}`;

    try {
      if (type === 'generate_video') {
        addResult({ id: resultId, type, status: 'pending', taskId: undefined });
        const payload = {
          prompt: String(params.prompt || ''),
          model: String(params.model || 'kling'),
          duration: Number(params.duration || 5),
          aspect_ratio: String(params.aspect_ratio || '9:16'),
          sound: String(params.sound || 'none'),
        };
        const res = await videoApi.generate(payload);
        if (res?.code === 0) {
          const taskId = res?.data?.task_id;
          addResult({ id: resultId, type, status: 'success', taskId, content: `Task #${taskId} queued` });
          openInfo(
            (t as any).ai_creator_title || 'AI Creator',
            (t as any).ai_creator_video_queued || 'Video generation started! Check the task queue for progress.'
          );
        } else {
          throw new Error(res?.message || 'Video generation failed');
        }
      } else if (type === 'generate_script') {
        addResult({ id: resultId, type, status: 'pending' });
        if (!user?.id) throw new Error('User not authenticated');
        const payload = {
          product_name: String(params.product_name || params.prompt || ''),
          product_description: String(params.product_description || params.prompt || ''),
          duration: Number(params.duration || 30),
          style: String(params.style || 'casual'),
          language: String(params.language || 'zh'),
        };
        const res = await videoApi.generateScript(user.id, payload);
        if (res?.code === 0) {
          const scripts = res?.data?.script_contents || [];
          const text = scripts.map((s: any) => s?.content || s?.script || String(s)).join('\n\n---\n\n');
          addResult({ id: resultId, type, status: 'success', content: text || 'Script generated successfully' });
        } else {
          throw new Error(res?.message || 'Script generation failed');
        }
      } else if (type === 'generate_image') {
        addResult({ id: resultId, type, status: 'pending' });
        const payload = {
          prompt: String(params.prompt || ''),
          aspect_ratio: String(params.aspect_ratio || '9:16'),
          resolution: String(params.resolution || '2K'),
        };
        const res = await aiCreatorApi.generateImage(payload);
        if (res?.code === 0) {
          const imageUrl = res?.data?.image_url;
          addResult({ id: resultId, type, status: 'success', imageUrl });
        } else {
          throw new Error(res?.message || 'Image generation failed');
        }
      } else if (type === 'generate_first_frame') {
        addResult({ id: resultId, type, status: 'pending' });
        // First frame needs reference image — try with empty or guide user
        openInfo(
          (t as any).ai_creator_title || 'AI Creator',
          (t as any).ai_creator_first_frame_tip || 'First frame generation requires a reference product image. Please upload one in the Product Images → First Frame page.'
        );
        addResult({ id: resultId, type, status: 'failed', error: 'Reference image required' });
      } else if (type === 'clothing_swap') {
        openInfo(
          (t as any).ai_creator_title || 'AI Creator',
          (t as any).ai_creator_clothing_swap_tip || 'Please go to Product Images → Clothing Swap to upload your garment and model images.'
        );
      } else {
        openInfo(
          (t as any).ai_creator_title || 'AI Creator',
          (t as any).ai_creator_unsupported || 'This feature is not yet supported for one-click generation.'
        );
      }
    } catch (err: any) {
      addResult({ id: resultId, type, status: 'failed', error: err?.message || 'Generation failed' });
      openInfo(
        (t as any).ai_creator_title || 'AI Creator',
        err?.message || (t as any).ai_creator_error || 'Generation failed. Please try again.'
      );
    } finally {
      setGeneratingType(null);
    }
  };

  const quickSend = (text: string) => {
    handleSend(text);
  };

  // Detect if the last assistant message is asking for a choice (routing)
  const lastAssistantMessage = messages.filter((m) => m.role === 'assistant').pop();
  const showRoutingButtons =
    lastAssistantMessage &&
    !lastAssistantMessage.action &&
    (lastAssistantMessage.content.includes('视频') ||
      lastAssistantMessage.content.includes('图片') ||
      lastAssistantMessage.content.includes('video') ||
      lastAssistantMessage.content.includes('image'));

  const renderResult = (result: GenerationResult) => {
    if (result.type === 'generate_image' && result.imageUrl) {
      return (
        <div className="mt-3 rounded-2xl overflow-hidden border border-white/10 bg-zinc-900">
          <div className="px-4 py-2 bg-zinc-950/50 text-xs text-zinc-400 flex items-center gap-2">
            <ImageIcon className="w-3.5 h-3.5" />
            {getActionLabel(result.type)}
          </div>
          <img src={result.imageUrl} alt="Generated" className="w-full max-h-[400px] object-contain bg-black" />
        </div>
      );
    }
    if (result.type === 'generate_script' && result.content) {
      return (
        <div className="mt-3 rounded-2xl border border-white/10 bg-zinc-900 overflow-hidden">
          <div className="px-4 py-2 bg-zinc-950/50 text-xs text-zinc-400 flex items-center gap-2">
            <ScrollText className="w-3.5 h-3.5" />
            {getActionLabel(result.type)}
          </div>
          <div className="p-4 text-sm text-zinc-200 whitespace-pre-wrap max-h-[400px] overflow-y-auto">{result.content}</div>
        </div>
      );
    }
    if (result.type === 'generate_video') {
      return (
        <div className="mt-3 rounded-2xl border border-white/10 bg-zinc-900 overflow-hidden">
          <div className="px-4 py-2 bg-zinc-950/50 text-xs text-zinc-400 flex items-center gap-2">
            <Film className="w-3.5 h-3.5" />
            {getActionLabel(result.type)}
            {result.status === 'pending' && <span className="text-orange-400 ml-2">{(t as any).ai_creator_generating || 'Generating...'}</span>}
            {result.status === 'success' && <span className="text-emerald-400 ml-2">Queued #{result.taskId}</span>}
            {result.status === 'failed' && <span className="text-red-400 ml-2">Failed</span>}
          </div>
          {result.status === 'success' && (
            <div className="p-4 text-sm text-zinc-400">
              {(t as any).ai_creator_video_queued || 'Video generation started! You can check progress in the task queue.'}
            </div>
          )}
        </div>
      );
    }
    return null;
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

      {/* Quick action buttons */}
      <div className="shrink-0 px-10 py-3 border-b border-white/5 flex items-center gap-2 overflow-x-auto">
        <button
          onClick={() => quickSend('我想生成一段视频')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/10 text-xs text-zinc-300 hover:border-orange-500/50 hover:text-orange-400 transition whitespace-nowrap"
        >
          <Film className="w-3.5 h-3.5" />
          {(t as any).ai_creator_quick_video || '生成视频'}
        </button>
        <button
          onClick={() => quickSend('我想生成一张图片')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/10 text-xs text-zinc-300 hover:border-orange-500/50 hover:text-orange-400 transition whitespace-nowrap"
        >
          <ImageIcon className="w-3.5 h-3.5" />
          {(t as any).ai_creator_quick_image || '生成图片'}
        </button>
        <button
          onClick={() => quickSend('我想生成一个脚本')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/10 text-xs text-zinc-300 hover:border-orange-500/50 hover:text-orange-400 transition whitespace-nowrap"
        >
          <ScrollText className="w-3.5 h-3.5" />
          {(t as any).ai_creator_quick_script || '生成脚本'}
        </button>
        <button
          onClick={() => quickSend('我想生成首帧图')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/10 text-xs text-zinc-300 hover:border-orange-500/50 hover:text-orange-400 transition whitespace-nowrap"
        >
          <ImagePlus className="w-3.5 h-3.5" />
          {(t as any).ai_creator_quick_first_frame || '生成首帧图'}
        </button>
      </div>

      {/* Chat + Results area */}
      <main className="flex-1 overflow-y-auto px-10 py-6 space-y-6">
        {messages.map((msg, idx) => (
          <div key={idx}>
            <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-5 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-orange-600 text-white'
                    : 'bg-zinc-900 border border-white/10 text-zinc-200'
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>

                {/* Action card inside assistant message */}
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
                      disabled={generatingType !== null}
                      className="mt-1 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-600 text-xs text-white font-semibold hover:bg-orange-500 transition disabled:opacity-50"
                    >
                      {generatingType === msg.action.type ? (
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

            {/* Routing quick-reply buttons */}
            {msg.role === 'assistant' &&
              idx === messages.length - 1 &&
              showRoutingButtons && (
                <div className="flex gap-2 mt-2 ml-1">
                  <button
                    onClick={() => quickSend('我想生成视频')}
                    className="px-3 py-1.5 rounded-lg bg-zinc-800 border border-white/10 text-xs text-zinc-300 hover:border-orange-500/50 hover:text-orange-400 transition"
                  >
                    🎬 {(t as any).ai_creator_quick_video || '生成视频'}
                  </button>
                  <button
                    onClick={() => quickSend('我想生成图片')}
                    className="px-3 py-1.5 rounded-lg bg-zinc-800 border border-white/10 text-xs text-zinc-300 hover:border-orange-500/50 hover:text-orange-400 transition"
                  >
                    🖼️ {(t as any).ai_creator_quick_image || '生成图片'}
                  </button>
                </div>
              )}
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

        {/* Render generation results */}
        {results.map((result) => (
          <div key={result.id} className="flex justify-start">
            <div className="max-w-[80%] w-full">
              {renderResult(result)}
            </div>
          </div>
        ))}

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
            onClick={() => handleSend()}
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
