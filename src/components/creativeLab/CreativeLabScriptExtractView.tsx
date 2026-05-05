import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Clipboard, Loader2, UploadCloud, Video, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { videoApi } from '../../services/video';
import { clearCreativeLabSession } from './creativeLabHistory';
import { pickReplayScripts, type ReplayScriptBundle } from './replayReverseScript';
import { normalizeScriptError } from '../../utils/taskError';

export const CreativeLabScriptExtractView: React.FC = () => {
  const { user } = useAuth();
  const { language } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [productFocus, setProductFocus] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [result, setResult] = useState<ReplayScriptBundle | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    clearCreativeLabSession(user?.id, 'script_extract');
  }, [user?.id]);

  const videoPreviewUrl = useMemo(() => (videoFile ? URL.createObjectURL(videoFile) : ''), [videoFile]);

  useEffect(() => () => {
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
  }, [videoPreviewUrl]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setVideoFile(file);
    setResult(null);
    setError('');
  };

  const removeVideo = () => {
    setVideoFile(null);
    setResult(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleExtract = async () => {
    if (!user?.id || !videoFile || isExtracting) return;
    const traceId = `script-extract-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const formData = new FormData();
    formData.append('video_file', videoFile);
    formData.append('user_language', language);
    formData.append('product_focus', productFocus.trim());
    formData.append('core_selling_points', productFocus.trim());
    formData.append('debug_trace_id', traceId);
    formData.append('debug', 'true');

    setIsExtracting(true);
    setError('');
    setResult(null);
    try {
      const resp = await videoApi.reverseScriptFromVideo(user.id, formData);
      const bundle = pickReplayScripts(resp?.data || {});
      if (!bundle.displayScript) throw new Error('脚本提取完成，但没有返回可用脚本');
      setResult(bundle);
    } catch (err: any) {
      setError(normalizeScriptError(err));
    } finally {
      setIsExtracting(false);
    }
  };

  const copyText = async () => {
    const value = result?.displayScript;
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-950 text-zinc-100">
      <div className="border-b border-white/10 px-8 py-5">
        <div className="text-lg font-black">脚本提取</div>
        <div className="mt-1 text-xs text-zinc-500">上传参考广告视频，提取可直接用于 Seedance 的详尽复刻提示词。</div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto flex max-w-4xl flex-col gap-4">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.mov,.mkv,.webm,.avi,.m4v"
              className="hidden"
              onChange={handleFileChange}
            />
            {videoFile ? (
              <div className="grid gap-4 md:grid-cols-[180px_1fr_auto] md:items-center">
                <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
                  <video src={videoPreviewUrl} className="aspect-video w-full object-contain" controls playsInline preload="metadata" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-zinc-100">{videoFile.name}</div>
                  <div className="mt-1 text-xs text-zinc-500">{(videoFile.size / 1024 / 1024).toFixed(2)} MB</div>
                </div>
                <button type="button" onClick={removeVideo} className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 p-2 text-zinc-300 hover:bg-white/10" title="移除视频">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex min-h-[220px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-zinc-950/40 px-6 text-center text-zinc-500 hover:border-orange-400/50 hover:bg-orange-500/5 hover:text-zinc-200"
              >
                <UploadCloud className="mb-3 h-10 w-10 text-orange-300" />
                <span className="text-sm font-black text-zinc-200">上传参考视频</span>
                <span className="mt-2 text-xs text-zinc-500">MP4 / MOV / WebM / MKV / AVI</span>
              </button>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <label className="block text-sm font-bold text-zinc-200" htmlFor="script-product-focus">简短输入</label>
            <input
              id="script-product-focus"
              value={productFocus}
              onChange={(event) => setProductFocus(event.target.value.slice(0, 100))}
              className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-orange-400/70"
              placeholder="例如：重点关注服装换装、护肤品质感、鞋底防滑细节"
              maxLength={100}
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-bold text-zinc-200">
                <Video className="h-4 w-4 text-orange-300" />
                提示词展示
              </div>
              <button type="button" onClick={() => void copyText()} disabled={!result?.displayScript} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-zinc-200 hover:bg-white/10 disabled:opacity-40">
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Clipboard className="h-4 w-4" />}
                {copied ? '已复制' : '复制脚本'}
              </button>
            </div>
            {isExtracting ? (
              <div className="flex min-h-[320px] items-center justify-center gap-2 text-sm font-bold text-orange-300">
                <Loader2 className="h-5 w-5 animate-spin" />正在逐帧理解视频
              </div>
            ) : error ? (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-100">{error}</div>
            ) : result?.displayScript ? (
              <pre className="creative-script-output max-h-[480px] overflow-auto whitespace-pre-wrap rounded-xl border p-4 text-xs leading-6">{result.displayScript}</pre>
            ) : (
              <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-zinc-950/40 text-sm font-bold text-zinc-500">等待上传视频后提取</div>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 px-8 py-4">
        <div className="mx-auto flex max-w-4xl justify-end">
          <button type="button" onClick={() => void handleExtract()} disabled={!videoFile || isExtracting || !user?.id} className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-2 text-sm font-black text-black hover:bg-orange-400 disabled:opacity-50">
            {isExtracting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isExtracting ? '提取中' : '提取脚本'}
          </button>
        </div>
      </div>
    </div>
  );
};