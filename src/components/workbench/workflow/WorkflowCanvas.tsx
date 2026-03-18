import React, { useState } from 'react';
import { Tab } from '@headlessui/react';
import { ChevronRight, Copy, Trash2, Share2, Download } from 'lucide-react';
import type { Workflow } from './workflowStore';
import { WorkflowStep } from './WorkflowStep';
import { ConnectorLine } from './ConnectorLine';

interface WorkflowCanvasProps {
  workflow: Workflow;
  onStepClick: (stepId: string) => void;
}

export const WorkflowCanvas: React.FC<WorkflowCanvasProps> = ({ workflow, onStepClick }) => {
  const [selectedTab, setSelectedTab] = useState<'workflow' | 'logs' | 'history' | 'details'>('workflow');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);

  const handleStepExpand = (stepId: string) => {
    // 调用store的toggleStepExpanded
    onStepClick(stepId);
  };

  const handleStepEdit = (stepId: string) => {
    setEditingStepId(stepId);
    setShowEditModal(true);
  };

  const handleStepRetry = (stepId: string) => {
    // 实现重试逻辑
    console.log('Retrying step:', stepId);
  };

  const handleStepShowDetail = (stepId: string) => {
    // 显示日志详情
    setSelectedTab('logs');
  };

  const format = (date: Date | undefined) => {
    if (!date) return '';
    return new Date(date).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="w-full h-full flex flex-col overflow-hidden bg-zinc-900/20">
      {/* Tabs Header */}
      <div className="border-b border-white/10 bg-zinc-900/40 px-4">
        <Tab.Group selectedIndex={['workflow', 'logs', 'history', 'details'].indexOf(selectedTab)} onChange={(idx) => setSelectedTab(['workflow', 'logs', 'history', 'details'][idx] as any)}>
          <Tab.List className="flex gap-1 py-0">
            {[
              { key: 'workflow' as const, label: '工作流', icon: '▶' },
              { key: 'logs' as const, label: '📋 日志', icon: '📋' },
              { key: 'history' as const, label: '📚 历史', icon: '📚' },
              { key: 'details' as const, label: '⚙️ 详情', icon: '⚙️' },
            ].map((tab) => (
              <Tab
                key={tab.key}
                className={({ selected }) =>
                  `px-4 py-3 text-sm font-medium border-b-2 transition outline-none ${
                    selected
                      ? 'border-orange-500/60 text-orange-400'
                      : 'border-transparent text-zinc-400 hover:text-zinc-300'
                  }`
                }
              >
                {tab.label}
              </Tab>
            ))}
          </Tab.List>
        </Tab.Group>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {selectedTab === 'workflow' && (
          <div className="p-6 space-y-3 max-w-3xl mx-auto">
            {/* Workflow Steps with Connectors */}
            {workflow.steps.map((step, idx) => (
              <React.Fragment key={step.id}>
                <WorkflowStep
                  step={step}
                  isActive={workflow.currentStepIndex === idx}
                  onExpand={() => handleStepExpand(step.id)}
                  onEdit={() => handleStepEdit(step.id)}
                  onRetry={() => handleStepRetry(step.id)}
                  onShowDetail={() => handleStepShowDetail(step.id)}
                />

                {/* Connector Line to Next Step */}
                {idx < workflow.steps.length - 1 && (
                  <ConnectorLine
                    fromStatus={step.status}
                    toStatus={workflow.steps[idx + 1].status}
                    height={40}
                    isError={step.status === 'failed'}
                    isOptional={workflow.steps[idx + 1].type === 'optimization'}
                  />
                )}
              </React.Fragment>
            ))}

            {/* Summary */}
            <div className="mt-6 p-4 bg-zinc-900/40 border border-white/10 rounded-xl">
              <div className="text-sm text-zinc-300">
                <p>
                  <span className="font-semibold">整体进度:</span> {workflow.overallProgress}%
                </p>
                <p className="mt-1">
                  <span className="font-semibold">状态:</span>{' '}
                  {workflow.status === 'running' && '🔄 进行中'}
                  {workflow.status === 'completed' && '✓ 完成'}
                  {workflow.status === 'failed' && '✗ 失败'}
                </p>
              </div>
            </div>
          </div>
        )}

        {selectedTab === 'logs' && (
          <div className="p-6">
            <div className="space-y-2 text-xs font-mono text-zinc-400 max-w-3xl mx-auto">
              {[...workflow.steps]
                .sort((a, b) => (a.startedAt?.getTime() ?? 0) - (b.startedAt?.getTime() ?? 0))
                .map((step) => (
                  <div key={step.id} className="space-y-1">
                    {step.startedAt && (
                      <div className="text-orange-400">
                        [{format(step.startedAt)}] 🔄 {step.title} - 开始
                      </div>
                    )}
                    {step.completedAt && step.status === 'completed' && (
                      <div className="text-green-400">
                        [{format(step.completedAt)}] ✓ {step.title} - 完成
                        {step.startedAt && (
                          <span className="text-zinc-500">
                            {' '}
                            ({Math.round((step.completedAt.getTime() - step.startedAt.getTime()) / 1000)}秒)
                          </span>
                        )}
                      </div>
                    )}
                    {step.completedAt && step.status === 'failed' && (
                      <div className="text-red-400">
                        [{format(step.completedAt)}] ✗ {step.title} - 失败: {step.error?.message}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}

        {selectedTab === 'history' && (
          <div className="p-6">
            <div className="max-w-3xl mx-auto text-zinc-400 text-sm">
              <p>历史记录面板（功能开发中）</p>
              <p className="text-xs mt-2">
                将在此显示最近的工作流执行记录，支持重新执行、分享和删除。
              </p>
            </div>
          </div>
        )}

        {selectedTab === 'details' && (
          <div className="p-6">
            <div className="max-w-3xl mx-auto space-y-4">
              <div className="bg-zinc-900/40 border border-white/10 rounded-xl p-4 space-y-2 text-sm">
                <div>
                  <span className="text-zinc-400">任务ID:</span>{' '}
                  <code className="text-orange-400 ml-2">{workflow.id}</code>
                </div>
                <div>
                  <span className="text-zinc-400">项目ID:</span>{' '}
                  <code className="text-orange-400 ml-2">{workflow.projectId}</code>
                </div>
                <div>
                  <span className="text-zinc-400">开始时间:</span>{' '}
                  <span className="text-zinc-300 ml-2">{format(workflow.startedAt)}</span>
                </div>
                {workflow.completedAt && (
                  <div>
                    <span className="text-zinc-400">完成时间:</span>{' '}
                    <span className="text-zinc-300 ml-2">{format(workflow.completedAt)}</span>
                  </div>
                )}
                <div>
                  <span className="text-zinc-400">消耗V点:</span>{' '}
                  <span className="text-orange-400 ml-2">{workflow.metadata?.costSummary?.v_points ?? 1}</span>
                </div>
              </div>

              {/* Share Section */}
              <div className="bg-zinc-900/40 border border-white/10 rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-semibold text-zinc-300">分享工作流</h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={workflow.metadata?.shareLink ?? `vflow.ai/share/${workflow.id}`}
                    readOnly
                    className="flex-1 bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-400"
                  />
                  <button className="px-3 py-2 rounded-lg bg-orange-500/20 border border-orange-500/40 text-orange-400 hover:bg-orange-500/30 transition text-xs flex items-center gap-1">
                    <Copy size={14} />
                    复制
                  </button>
                </div>
              </div>

              {/* Export Section */}
              <div className="bg-zinc-900/40 border border-white/10 rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-semibold text-zinc-300">导出</h3>
                <div className="flex gap-2 flex-wrap">
                  <button className="px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-zinc-300 hover:bg-white/10 transition text-xs flex items-center gap-1">
                    <Download size={14} />
                    导出JSON
                  </button>
                  <button className="px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-zinc-300 hover:bg-white/10 transition text-xs flex items-center gap-1">
                    <Download size={14} />
                    导出日志
                  </button>
                  {workflow.metadata?.costSummary?.v_points && (
                    <button className="px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-zinc-300 hover:bg-white/10 transition text-xs flex items-center gap-1">
                      <Download size={14} />
                      导出视频
                    </button>
                  )}
                </div>
              </div>

              {/* Danger Zone */}
              <div className="bg-red-900/10 border border-red-500/20 rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-semibold text-red-400">危险区域</h3>
                <button className="px-3 py-2 rounded-lg bg-red-900/20 border border-red-500/40 text-red-400 hover:bg-red-900/30 transition text-xs flex items-center gap-1">
                  <Trash2 size={14} />
                  删除此记录
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
