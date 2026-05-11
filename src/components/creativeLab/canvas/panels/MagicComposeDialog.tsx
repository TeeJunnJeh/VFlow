/**
 * MagicCompose: LibTV-style "one sentence → working scaffold" macro.
 *
 * MVP behaviour: the user types a prompt and picks N shots; the macro auto-creates
 * a TextNode (carrying the prompt) and a ScriptNode (auto-generated via the backend
 * script service) connected via an edge. From there the user can multi-select shots
 * and trigger image / video generation manually.
 *
 * Why not auto-cascade to image+video here:
 *   - Image generation requires reference uploads (generateFirstFrame),
 *   - Cascading 3-5 video tasks at once would silently spend credits without
 *     a confirmation step.
 * The path is documented and can be extended once we have a server-side orchestrator.
 */
import React, { useState } from 'react';
import { X, Wand2, Loader2 } from 'lucide-react';
import { useLanguage } from '../../../../context/LanguageContext';

interface MagicComposeDialogProps {
  open: boolean;
  onClose: () => void;
  onCompose: (config: {
    prompt: string;
    shotCount: number;
    style: string;
    duration: number;
    aspectRatio: '9:16' | '16:9' | '1:1';
  }) => Promise<void> | void;
}

export const MagicComposeDialog: React.FC<MagicComposeDialogProps> = ({ open, onClose, onCompose }) => {
  const { t, language } = useLanguage();
  const isZh = language === 'zh';

  const [prompt, setPrompt] = useState('');
  const [shotCount, setShotCount] = useState(3);
  const [style, setStyle] = useState('realistic');
  const [duration, setDuration] = useState(10);
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9' | '1:1'>('9:16');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!prompt.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onCompose({ prompt: prompt.trim(), shotCount, style, duration, aspectRatio });
      setPrompt('');
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 bg-gradient-to-r from-orange-500/10 to-pink-500/10">
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-orange-400" />
            <h3 className="text-sm font-semibold text-zinc-200">
              {isZh ? '一句话出短片' : 'Magic Compose'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/5 text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            {isZh
              ? '描述你想要的短片，画布会自动生成一段分镜脚本，你接下来可以一键展开为图片和视频节点。'
              : 'Describe the short film you want. The canvas auto-generates a storyboard you can then expand into image and video nodes.'}
          </p>

          <div>
            <label className="text-[11px] text-zinc-500 mb-1.5 block">
              {isZh ? '创意描述' : 'Prompt'}
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={isZh ? '夏季冰丝 T 恤 5 秒广告' : 'A 5-second summer cooling tee ad'}
              rows={3}
              autoFocus
              className="w-full px-3 py-2 text-sm bg-zinc-800 border border-white/10 rounded-md text-zinc-200 resize-none focus:outline-none focus:border-orange-500/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-zinc-500 mb-1.5 block">
                {isZh ? '分镜数' : 'Shots'}
              </label>
              <select
                value={shotCount}
                onChange={(e) => setShotCount(Number(e.target.value))}
                className="w-full px-2 py-1.5 text-sm bg-zinc-800 border border-white/10 rounded text-zinc-200 focus:outline-none"
              >
                {[3, 5, 7].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-zinc-500 mb-1.5 block">
                {isZh ? '总时长' : 'Duration'}
              </label>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full px-2 py-1.5 text-sm bg-zinc-800 border border-white/10 rounded text-zinc-200 focus:outline-none"
              >
                {[5, 10, 15, 20].map((n) => (
                  <option key={n} value={n}>{n}s</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-zinc-500 mb-1.5 block">
                {isZh ? '风格' : 'Style'}
              </label>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                className="w-full px-2 py-1.5 text-sm bg-zinc-800 border border-white/10 rounded text-zinc-200 focus:outline-none"
              >
                <option value="realistic">{t.canvas_gen_style_realistic || 'Realistic'}</option>
                <option value="anime">{t.canvas_gen_style_anime || 'Anime'}</option>
                <option value="3d">{t.canvas_gen_style_3d || '3D'}</option>
                <option value="cinematic">{t.canvas_gen_style_cinematic || 'Cinematic'}</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-zinc-500 mb-1.5 block">
                {isZh ? '画幅' : 'Ratio'}
              </label>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value as '9:16' | '16:9' | '1:1')}
                className="w-full px-2 py-1.5 text-sm bg-zinc-800 border border-white/10 rounded text-zinc-200 focus:outline-none"
              >
                <option value="9:16">9:16</option>
                <option value="16:9">16:9</option>
                <option value="1:1">1:1</option>
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/5 bg-zinc-900/60">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
          >
            {t.canvas_gen_cancel || 'Cancel'}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!prompt.trim() || submitting}
            className="px-4 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-400 hover:to-pink-400 text-white"
          >
            {submitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Wand2 className="w-3.5 h-3.5" />
            )}
            {isZh ? '开始生成' : 'Compose'}
          </button>
        </div>
      </div>
    </div>
  );
};
