import React, { useEffect, useMemo, useState } from 'react';
import { Check, Clipboard, Loader2, PlaySquare } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { videoApi } from '../../services/video';
import type { Asset } from '../../services/assets';
import { CreativeAssetPickerDialog } from './CreativeAssetPickerDialog';
import { clearCreativeLabSession, loadCreativeLabSession, saveCreativeLabSession, type CreativeLabMessage } from './creativeLabHistory';
import { normalizeScriptError } from '../../utils/taskError';

const makeId = () => `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const CreativeLabScriptExtractView: React.FC = () => {
  const { user } = useAuth();
  const { language } = useLanguage();
  const [videoAsset, setVideoAsset] = useState<Asset | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [messages, setMessages] = useState<CreativeLabMessage[]>(() => loadCreativeLabSession(user?.id, 'script_extract').messages);

  useEffect(() => {
    const session = loadCreativeLabSession(user?.id, 'script_extract');
    setMessages(session.messages);
  }, [user?.id]);

  useEffect(() => {
    const session = loadCreativeLabSession(user?.id, 'script_extract');
    saveCreativeLabSession(user?.id, { ...session, messages });
  }, [messages, user?.id]);

  const latestScript = useMemo(() => {
    const latest = [...messages].reverse().find((message) => message.script);
    return latest?.script || '';
  }, [messages]);

  const handleExtract = async () => {
    if (!user?.id || !videoAsset || isExtracting) return;
    const traceId = `script-extract-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const pendingId = makeId();
    setIsExtracting(true);
    setMessages((prev) => [
      ...prev,
      { id: makeId(), role: 'user', content: `提取参考广告脚本：${videoAsset.name}`, createdAt: Date.now() },
      { id: pendingId, role: 'assistant', content: '正在理解视频并整理 Seedance 可用广告脚本…', createdAt: Date.now(), status: 'extracting' },
    ]);
    try {
      const resp = await videoApi.reverseScriptFromVideo(user.id, {
        video_path: videoAsset.file_url,
        user_language: language,
        debug_trace_id: traceId,
        debug: true,
      });
      const data: any = resp?.data || {};
      const script = String(data.seedancePrompt || data.seedance_prompt || data.suggestedPrompt || data.styleReferenceText || '').trim();
      if (!script) throw new Error('脚本提取完成，但没有返回可用脚本');
      setMessages((prev) => prev.map((message) => message.id === pendingId
        ? { ...message, status: 'success', content: '脚本已提取完成。', script, scriptExpanded: true }
        : message));
    } catch (err: any) {
      const errorMessage = normalizeScriptError(err);
      setMessages((prev) => prev.map((message) => message.id === pendingId
        ? { ...message, status: 'failed', content: '脚本提取失败。', error: errorMessage }
        : message));
    } finally {
      setIsExtracting(false);
    }
  };

  const copyScript = async () => {
    if (!latestScript) return;
    await navigator.clipboard.writeText(latestScript);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  const clearHistory = () => {
    clearCreativeLabSession(user?.id, 'script_extract');
    setMessages([]);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-950 text-zinc-100">
      <div className="border-b border-white/10 px-8 py-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-lg font-black">脚本提取</div>
            <div className="mt-1 text-xs text-zinc-500">上传或选择一个参考广告视频，输出可直接用于 Seedance 的详细广告脚本。</div>
          </div>
          <button type="button" onClick={clearHistory} className="rounded-xl px-3 py-2 text-xs font-bold text-zinc-500 hover:bg-white/5 hover:text-zinc-200">清空历史</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto flex max-w-4xl flex-col gap-4">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-bold text-zinc-200">参考广告视频</div>
                <div className="mt-1 truncate text-xs text-zinc-500">{videoAsset ? videoAsset.name : '尚未选择'}</div>
              </div>
              <button type="button" onClick={() => setIsPickerOpen(true)} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-zinc-200 hover:bg-white/10">
                从素材库选择
              </button>
            </div>
          </div>

          {messages.length === 0 ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/20 text-zinc-500">
              <PlaySquare className="mb-3 h-9 w-9" />
              <div className="text-sm font-bold">选择一个视频后开始提取</div>
            </div>
          ) : messages.map((message) => (
            <div key={message.id} className={`rounded-2xl border p-4 ${message.role === 'user' ? 'ml-auto max-w-2xl border-orange-500/20 bg-orange-500/10' : 'mr-auto w-full max-w-4xl border-white/10 bg-black/25'}`}>
              <div className="whitespace-pre-wrap text-sm leading-6 text-zinc-200">{message.content}</div>
              {message.status === 'extracting' ? <div className="mt-3 flex items-center gap-2 text-xs text-orange-300"><Loader2 className="h-4 w-4 animate-spin" />处理中</div> : null}
              {message.error ? <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">{message.error}</div> : null}
              {message.script ? <pre className="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-zinc-950/70 p-4 text-xs leading-6 text-zinc-200">{message.script}</pre> : null}
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-white/10 px-8 py-4">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={copyScript} disabled={!latestScript} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-zinc-200 hover:bg-white/10 disabled:opacity-40">
            {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Clipboard className="h-4 w-4" />}
            {copied ? '已复制' : '复制最新脚本'}
          </button>
          <button type="button" onClick={handleExtract} disabled={!videoAsset || isExtracting || !user?.id} className="rounded-xl bg-orange-500 px-5 py-2 text-sm font-black text-black hover:bg-orange-400 disabled:opacity-50">
            {isExtracting ? '提取中…' : '提取脚本'}
          </button>
        </div>
      </div>

      <CreativeAssetPickerDialog
        isOpen={isPickerOpen}
        kind="motion"
        selectedIds={videoAsset ? [videoAsset.id] : []}
        onClose={() => setIsPickerOpen(false)}
        onConfirm={(assets) => {
          setVideoAsset(assets[0] || null);
          setIsPickerOpen(false);
        }}
      />
    </div>
  );
};
