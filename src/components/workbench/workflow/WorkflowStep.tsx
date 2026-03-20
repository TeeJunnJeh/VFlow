import React from 'react';
import { ChevronDown, Copy, RotateCcw, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import type { WorkflowStep as WorkflowStepType, StepStatus } from './workflowStore';

interface WorkflowStepProps {
  step: WorkflowStepType;
  isActive: boolean;
  onExpand: () => void;
  onEdit: () => void;
  onRetry: () => void;
  onShowDetail: () => void;
}

const statusConfig: Record<StepStatus, { icon: React.ReactNode; label: string; bgColor: string; borderColor: string; textColor: string }> = {
  pending: {
    icon: <div className="w-5 h-5 rounded-full border-2 border-zinc-600 bg-zinc-800" />,
    label: '待处理',
    bgColor: 'bg-zinc-800',
    borderColor: 'border-zinc-600',
    textColor: 'text-zinc-400',
  },
  running: {
    icon: <Clock size={20} className="text-orange-400 animate-spin" />,
    label: '进行中',
    bgColor: 'bg-orange-900/30',
    borderColor: 'border-orange-500/60',
    textColor: 'text-orange-400',
  },
  completed: {
    icon: <CheckCircle size={20} className="text-green-400" />,
    label: '完成',
    bgColor: 'bg-green-900/20',
    borderColor: 'border-green-500/40',
    textColor: 'text-green-400',
  },
  failed: {
    icon: <AlertCircle size={20} className="text-red-400" />,
    label: '失败',
    bgColor: 'bg-red-900/30',
    borderColor: 'border-red-500/60',
    textColor: 'text-red-400',
  },
  skipped: {
    icon: <div className="w-5 h-5 rounded-full border-2 border-gray-500 bg-gray-800/20" />,
    label: '已跳过',
    bgColor: 'bg-gray-800/20',
    borderColor: 'border-gray-500/40',
    textColor: 'text-gray-400',
  },
};

export const WorkflowStep: React.FC<WorkflowStepProps> = ({
  step,
  isActive,
  onExpand,
  onEdit,
  onRetry,
  onShowDetail,
}) => {
  const config = statusConfig[step.status];
  const isExpanded = step.isExpanded ?? false;

  // 折叠状态
  if (!isExpanded) {
    return (
      <div
        onClick={onExpand}
        className={`
          rounded-xl border-2 px-4 py-3 cursor-pointer transition-all
          ${config.bgColor} ${config.borderColor}
          hover:shadow-lg hover:scale-102
        `}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex-shrink-0">{config.icon}</div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-zinc-100 truncate">
                {step.title}
              </h3>
              <p className="text-xs text-zinc-400 truncate">
                {step.startedAt && step.completedAt
                  ? `${Math.round((step.completedAt.getTime() - step.startedAt.getTime()) / 1000)}秒`
                  : 'ago'}
              </p>
            </div>
          </div>
          <ChevronDown
            size={18}
            className={`flex-shrink-0 text-zinc-500 transition-transform ${
              isExpanded ? 'transform rotate-180' : ''
            }`}
          />
        </div>
      </div>
    );
  }

  // 展开状态
  return (
    <div
      className={`
        rounded-xl border-2 overflow-hidden transition-all duration-300
        ${config.bgColor} ${config.borderColor}
      `}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-zinc-900/40">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0">{config.icon}</div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">{step.title}</h3>
            <p className="text-xs text-zinc-400 mt-0.5">{step.description}</p>
          </div>
        </div>
        <button
          onClick={onExpand}
          className="p-1 hover:bg-white/10 rounded transition"
        >
          <ChevronDown
            size={18}
            className={`text-zinc-500 transition-transform ${
              isExpanded ? 'transform rotate-180' : ''
            }`}
          />
        </button>
      </div>

      {/* Content */}
      <div className="px-4 py-3 space-y-3 bg-zinc-900/20">
        {/* Input Information */}
        {Object.keys(step.input).length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-zinc-300 mb-2 uppercase">输入信息</h4>
            <div className="bg-zinc-800/40 rounded-lg p-3 text-xs text-zinc-300 space-y-1">
              {Object.entries(step.input).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-zinc-400">• {key}:</span>
                  <span className="text-zinc-200 truncate ml-2">
                    {typeof value === 'string' ? value : JSON.stringify(value).slice(0, 50)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Progress Bar (for running steps) */}
        {step.status === 'running' && step.progress !== undefined && (
          <div>
            <h4 className="text-xs font-semibold text-zinc-300 mb-2">进度</h4>
            <div className="space-y-2">
              <div className="w-full bg-zinc-700 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-orange-400 to-orange-600 transition-all duration-500"
                  style={{ width: `${step.progress}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-zinc-400">
                <span>{step.progress}%</span>
                {step.estimatedRemaining && (
                  <span>剩余: {step.estimatedRemaining}秒</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Output Information */}
        {step.output && Object.keys(step.output).length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-zinc-300 mb-2 uppercase">输出信息</h4>
            <div className="bg-zinc-800/40 rounded-lg p-3 text-xs text-zinc-300 space-y-1">
              {Object.entries(step.output).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-zinc-400">• {key}:</span>
                  <span className="text-green-400 truncate ml-2">
                    {typeof value === 'string' ? value : JSON.stringify(value).slice(0, 50)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error Information */}
        {step.error && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-red-300 flex-1">
                <p className="font-semibold mb-1">错误: {step.error.code || '未知错误'}</p>
                <p>{step.error.message}</p>
                {step.error.details && (
                  <details className="mt-2 text-red-400 cursor-pointer">
                    <summary className="underline">详细信息</summary>
                    <pre className="mt-1 text-[10px] overflow-auto p-2 bg-zinc-900 rounded">
                      {JSON.stringify(step.error.details, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Timestamps */}
        {(step.startedAt || step.completedAt) && (
          <div className="text-xs text-zinc-500 space-y-1 border-t border-white/10 pt-3">
            {step.startedAt && (
              <div>⏰ 开始: {step.startedAt.toLocaleTimeString('zh-CN')}</div>
            )}
            {step.completedAt && (
              <div>
                ✓ 完成: {step.completedAt.toLocaleTimeString('zh-CN')}
                {step.startedAt && (
                  <span className="ml-2 text-zinc-600">
                    ({Math.round((step.completedAt.getTime() - step.startedAt.getTime()) / 1000)}秒)
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-white/10 bg-zinc-900/40 flex gap-2 flex-wrap">
        <button
          onClick={onExpand}
          className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-300 hover:bg-white/10 transition"
        >
          收起
        </button>

        {step.status === 'completed' && (
          <>
            <button
              onClick={onEdit}
              className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-300 hover:bg-white/10 transition"
            >
              编辑
            </button>
            <button
              onClick={onShowDetail}
              className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-300 hover:bg-white/10 transition"
            >
              日志
            </button>
          </>
        )}

        {step.status === 'failed' && (
          <>
            <button
              onClick={onEdit}
              className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-300 hover:bg-white/10 transition"
            >
              编辑参数
            </button>
            <button
              onClick={onRetry}
              className="text-xs px-3 py-1.5 rounded-lg bg-orange-500/20 border border-orange-500/40 text-orange-400 hover:bg-orange-500/30 transition"
            >
              <RotateCcw size={12} className="inline mr-1" />
              重试
            </button>
          </>
        )}
      </div>
    </div>
  );
};
