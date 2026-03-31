/**
 * 生成进度显示组件
 */

import React, { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';

interface LoadingProgressProps {
  progress: number; // 0-100
  estimatedTime?: number; // 秒
  currentStep?: string;
  totalSteps?: number;
  queuePosition?: number;
  onCancel: () => void;
}

export const LoadingProgress: React.FC<LoadingProgressProps> = ({
  progress,
  estimatedTime,
  currentStep,
  totalSteps,
  queuePosition,
  onCancel,
}) => {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [remainingTime, setRemainingTime] = useState(estimatedTime || 0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedTime((prev) => prev + 1);
      setRemainingTime((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-8 bg-gradient-to-br from-zinc-900 to-zinc-800 rounded-xl border border-zinc-700 shadow-2xl">
      {/* 标题 */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center mb-4">
          <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">
          正在生成首帧图...
        </h3>
        <p className="text-zinc-400 text-sm">
          请勿关闭页面，生成完成后会自动显示结果
        </p>
      </div>

      {/* 队列位置 */}
      {queuePosition !== undefined && (
        <div className="mb-6 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
          <p className="text-orange-400 text-sm">
            📋 队列位置: <span className="font-semibold">{queuePosition}</span>
          </p>
        </div>
      )}

      {/* 步骤显示（如果提供了步骤信息） */}
      {currentStep && totalSteps && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-zinc-300 text-sm font-medium">
              步骤: {currentStep}
            </p>
            <p className="text-zinc-400 text-xs">
              {Math.ceil((progress / 100) * (totalSteps || 1))} / {totalSteps}
            </p>
          </div>
          
          {/* 步骤进度条 */}
          <div className="w-full h-2 bg-zinc-700 rounded-full overflow-hidden">
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
          <p className="text-zinc-300 text-sm font-medium">生成进度</p>
          <p className="text-orange-400 font-semibold text-sm">
            {progress}%
          </p>
        </div>
        <div className="w-full h-3 bg-zinc-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-orange-500 to-orange-400 rounded-full transition-all duration-500 shadow-lg shadow-orange-500/30"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* 时间信息 */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-600">
          <p className="text-zinc-400 text-xs mb-1">已用时间</p>
          <p className="text-white font-semibold">
            {formatTime(elapsedTime)}
          </p>
        </div>
        <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-600">
          <p className="text-zinc-400 text-xs mb-1">
            {estimatedTime ? '预计剩余' : '无时间估算'}
          </p>
          <p className="text-white font-semibold">
            {estimatedTime ? formatTime(remainingTime) : '-'}
          </p>
        </div>
      </div>

      {/* 提示信息 */}
      <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
        <p className="text-blue-400 text-sm">
          💡 <span className="font-medium">提示:</span> 生成时间取决于图片复杂度和服务器负载，
          通常需要 30-60 秒。
        </p>
      </div>

      {/* 取消按钮 */}
      <button
        onClick={onCancel}
        className="w-full py-3 px-4 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/30 transition-all flex items-center justify-center gap-2 font-medium"
      >
        <X className="w-4 h-4" />
        取消生成
      </button>
    </div>
  );
};
