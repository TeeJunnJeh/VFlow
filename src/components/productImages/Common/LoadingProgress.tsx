/**
 * 生成进度显示组件
 */

import React, { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';

interface LoadingProgressProps {
  progress: number; // 0-100
  estimatedTime?: number; // 秒
  countdownStartSeconds?: number;
  startedAtMs?: number;
  currentStep?: string;
  totalSteps?: number;
  queuePosition?: number;
  title?: string; // 自定义标题，默认为'正在生成首帧图...'
  onCancel: () => void;
}

export const LoadingProgress: React.FC<LoadingProgressProps> = ({
  progress,
  estimatedTime,
  countdownStartSeconds,
  startedAtMs,
  currentStep,
  totalSteps,
  queuePosition,
  title,
  onCancel,
}) => {
  const { language } = useLanguage();
  const isZh = language === 'zh';
  const tr = (zhText: string, enText: string) => (isZh ? zhText : enText);
  const countdownBase = (() => {
    const direct = Number(countdownStartSeconds);
    if (Number.isFinite(direct) && direct > 0) return Math.floor(direct);

    const fallback = Number(estimatedTime);
    if (Number.isFinite(fallback) && fallback > 0) return Math.floor(fallback);

    return 0;
  })();

  const [elapsedTime, setElapsedTime] = useState(0);
  const [remainingTime, setRemainingTime] = useState(countdownBase);

  useEffect(() => {
    const originMs = Number.isFinite(startedAtMs) ? Number(startedAtMs) : Date.now();

    const tick = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - originMs) / 1000));
      setElapsedTime(elapsed);
      setRemainingTime(countdownBase > 0 ? Math.max(0, countdownBase - elapsed) : 0);
    };

    tick();
    const timer = window.setInterval(tick, 1000);

    return () => window.clearInterval(timer);
  }, [countdownBase, startedAtMs]);

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="glass-panel w-full max-w-2xl mx-auto p-8 rounded-xl border border-white/10 shadow-2xl">
      {/* 标题 */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center mb-4">
          <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">
          {title ? title : tr('正在生成首帧图...', 'Generating first-frame image...')}
        </h3>
        <p className="text-zinc-400 text-sm">
          {tr('请勿关闭页面，生成完成后会自动显示结果', 'Please keep this page open. Results will appear automatically.')}
        </p>
      </div>

      {/* 队列位置 */}
      {queuePosition !== undefined && (
        <div className="mb-6 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
          <p className="text-orange-400 text-sm">
            {tr('队列位置', 'Queue position')}: <span className="font-semibold">{queuePosition}</span>
          </p>
        </div>
      )}

      {/* 步骤显示（如果提供了步骤信息） */}
      {currentStep && totalSteps && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-zinc-300 text-sm font-medium">
              {tr('步骤', 'Step')}: {currentStep}
            </p>
            <p className="text-zinc-400 text-xs">
              {Math.ceil((progress / 100) * (totalSteps || 1))} / {totalSteps}
            </p>
          </div>
          
          {/* 步骤进度条 */}
          <div className="w-full h-2 bg-black/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-orange-500 to-orange-400 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* 主进度条 */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-zinc-300 text-sm font-medium">{tr('生成进度', 'Generation Progress')}</p>
          <p className="text-orange-400 font-semibold text-sm">
            {progress}%
          </p>
        </div>
        <div className="w-full h-3 bg-black/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-orange-500 to-orange-400 rounded-full transition-all duration-500 shadow-lg shadow-orange-500/30"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* 时间信息 */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-zinc-800/50 rounded-lg p-3 border border-white/10">
          <p className="text-zinc-400 text-xs mb-1">{tr('已用时间', 'Elapsed')}</p>
          <p className="text-white font-semibold">
            {formatTime(elapsedTime)}
          </p>
        </div>
        <div className="bg-zinc-800/50 rounded-lg p-3 border border-white/10">
          <p className="text-zinc-400 text-xs mb-1">
            {countdownBase > 0 ? tr('预计剩余', 'Estimated Remaining') : tr('无时间估算', 'No Estimate')}
          </p>
          <p className="text-white font-semibold">
            {countdownBase > 0 ? formatTime(remainingTime) : '-'}
          </p>
        </div>
      </div>

      {/* 提示信息 */}
      <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
        <p className="text-blue-400 text-sm">
          <span className="font-medium">{tr('提示', 'Tip')}:</span>{' '}
          {tr('生成时间取决于图片复杂度和服务器负载，通常需要 30-60 秒。', 'Generation time depends on image complexity and server load. It usually takes 30-60 seconds.')}
        </p>
      </div>

      {/* 取消按钮 */}
      <button
        onClick={onCancel}
        className="w-full py-3 px-4 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/30 transition-all flex items-center justify-center gap-2 font-medium"
      >
        <X className="w-4 h-4" />
        {tr('取消生成', 'Cancel Generation')}
      </button>
    </div>
  );
};
