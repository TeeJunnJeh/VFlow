import React from 'react';
import { Paperclip, X, ChevronRight } from 'lucide-react';
import { agentApi, type AgentAttachment, type AgentMessage, type AgentSkill } from '../../services/agent';
import { useLanguage } from '../../context/LanguageContext';
import { assetsApi } from '../../services/assets';
import { LanguageSwitcher } from '../common/LanguageSwitcher';
import { WorkflowCanvas } from './workflow/WorkflowCanvas';
import { useWorkflowStore } from './workflow/workflowStore';

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
  const [isUploading, setIsUploading] = React.useState(false);
  const [skills, setSkills] = React.useState<AgentSkill[]>([]);
  const [attachments, setAttachments] = React.useState<AgentAttachment[]>([]);
  
  // Workflow 状态
  const { workflow, updateWorkflow } = useWorkflowStore();
  
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, isSending]);

  React.useEffect(() => {
    let mounted = true;
    const loadSkills = async () => {
      try {
        const data = await agentApi.getSkills();
        if (mounted) setSkills(data);
      } catch {
        if (mounted) setSkills([]);
      }
    };
    void loadSkills();
    return () => {
      mounted = false;
    };
  }, []);

  const historyForApi = React.useMemo(() => {
    return messages.slice(-10);
  }, [messages]);

  const slashQuery = React.useMemo(() => {
    const trimmed = input.trimStart();
    if (!trimmed.startsWith('/')) return '';
    return trimmed.slice(1).toLowerCase();
  }, [input]);

  const suggestedSkills = React.useMemo(() => {
    if (!input.trimStart().startsWith('/')) return [];
    const q = slashQuery;
    const all = skills.slice(0, 8);
    if (!q) return all;
    return skills
      .filter((item) => {
        const target = `${item.command} ${item.name} ${item.description}`.toLowerCase();
        return target.includes(q);
      })
      .slice(0, 8);
  }, [input, slashQuery, skills]);

  const inferAttachmentKind = (file: File): AgentAttachment['media_kind'] => {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    if (file.type.startsWith('audio/')) return 'audio';

    const name = file.name.toLowerCase();
    if (/\.(pdf|doc|docx|ppt|pptx|xls|xlsx|txt|md|csv|json)$/.test(name)) return 'document';
    return 'file';
  };

  const onPickFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);

    try {
      const picked = Array.from(files).slice(0, 10);
      const uploaded: AgentAttachment[] = [];
      for (const file of picked) {
        const resp = await assetsApi.uploadTempAsset(file);
        const url = (resp?.data?.url || resp?.url || '').toString();
        if (!url) continue;
        const mediaKind = (resp?.data?.media_kind || inferAttachmentKind(file)) as AgentAttachment['media_kind'];
        uploaded.push({
          name: file.name,
          url,
          media_kind: mediaKind,
        });
      }
      if (uploaded.length > 0) {
        setAttachments((prev) => [...prev, ...uploaded].slice(0, 10));
      }
    } catch (err: any) {
      const msg = err?.message ? String(err.message) : t.agent_err_failed;
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `${t.agent_err_failed}：${msg}` },
      ]);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const send = async () => {
    const content = input.trim();
    if ((!content && attachments.length === 0) || isSending) return;

    const outgoingAttachments = [...attachments];
    const contentForView = outgoingAttachments.length
      ? `${content || '(附件消息)'}\n\n[attachments]\n${outgoingAttachments
          .map((item, idx) => `${idx + 1}. ${item.name} (${item.media_kind})`)
          .join('\n')}`
      : content;

    setInput('');
    setAttachments([]);
    setIsSending(true);

    setMessages((prev) => [...prev, { role: 'user', content: contentForView }]);

    // 初始化工作流
    updateWorkflow({
      id: `task_${Date.now()}`,
      projectId: 'current_project',
      userId: 'current_user',
      steps: initializeSteps(),
      currentStepIndex: 0,
      overallProgress: 0,
      status: 'running',
      createdAt: new Date(),
      startedAt: new Date(),
    });

    try {
      const { reply } = await agentApi.chat({
        message: content,
        history: historyForApi,
        attachments: outgoingAttachments,
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
    <div className="flex flex-col h-full min-h-0 bg-zinc-950">
      {/* Header */}
      <div className="px-6 py-5 border-b border-white/5 bg-zinc-950/30 flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold text-zinc-100">Agent 工作台</div>
          <div className="text-xs text-zinc-400 mt-1">
            生成视频、管理项目、优化内容
          </div>
        </div>
        <div className="flex items-center gap-4">
          <LanguageSwitcher />
        </div>
      </div>

      {/* Main Content - 40:60 Layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Panel: Dialog - 40% */}
        <div className="w-[40%] flex flex-col border-r border-white/5 overflow-hidden">
          {/* Skills Bar */}
          <div className="px-6 py-3 border-b border-white/5 bg-zinc-950/10 flex-shrink-0">
            <div className="flex flex-wrap gap-2">
              {skills.slice(0, 5).map((skill) => (
                <button
                  key={skill.id}
                  onClick={() => setInput(`${skill.command} `)}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-orange-500/30 text-orange-300 bg-orange-500/10 hover:bg-orange-500/20 transition"
                  title={skill.description}
                >
                  {skill.command}
                </button>
              ))}
            </div>
          </div>

          {/* Messages */}
          <div ref={listRef} className="flex-1 min-h-0 overflow-auto custom-scroll px-6 py-6 space-y-4">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`max-w-[800px] whitespace-pre-wrap text-sm leading-6 ${
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
              <div className="max-w-[800px] mr-auto text-zinc-200">
                <div className="bg-zinc-900/40 border border-white/5 rounded-2xl px-4 py-3 text-sm">
                  正在思考...
                </div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="px-6 py-4 border-t border-white/5 bg-zinc-950/30 flex-shrink-0">
            {suggestedSkills.length > 0 && (
              <div className="mb-3 rounded-xl border border-white/10 bg-zinc-900/70 p-2 space-y-1">
                {suggestedSkills.map((skill) => (
                  <button
                    key={skill.id}
                    onClick={() => setInput(`${skill.command} `)}
                    className="w-full text-left rounded-lg px-3 py-2 hover:bg-white/5 transition"
                  >
                    <div className="text-xs text-orange-300 font-medium">{skill.command}</div>
                    <div className="text-sm text-zinc-200">{skill.name}</div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">{skill.description}</div>
                  </button>
                ))}
              </div>
            )}

            {attachments.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {attachments.map((item, idx) => (
                  <div key={`${item.url}-${idx}`} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-900/70 px-3 py-1.5 text-xs text-zinc-200">
                    <span className="text-zinc-300">{item.name}</span>
                    <span className="text-zinc-500">({item.media_kind})</span>
                    <button
                      onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-zinc-400 hover:text-zinc-200"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3 items-end">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept="image/*,video/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,.csv,.json"
                onChange={(e) => {
                  void onPickFiles(e.target.files);
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isSending || isUploading}
                className="h-[44px] w-[44px] rounded-xl border border-white/15 bg-zinc-900/70 text-zinc-200 flex items-center justify-center disabled:opacity-50 flex-shrink-0"
                title="上传文件"
              >
                <Paperclip size={16} />
              </button>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder="输入提示词、问题或 / 查看命令..."
                className="flex-1 resize-none rounded-xl bg-zinc-900/60 border border-white/10 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                rows={2}
              />
              <button
                onClick={() => void send()}
                disabled={isSending || isUploading || (!input.trim() && attachments.length === 0)}
                className="h-[44px] px-5 rounded-xl bg-orange-500 text-black text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-orange-400 transition flex-shrink-0"
              >
                发送
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel: Workflow Canvas - 60% */}
        <div className="flex-1 min-h-0 overflow-hidden bg-zinc-900/20">
          {workflow && workflow.status === 'running' ? (
            <WorkflowCanvas workflow={workflow} onStepClick={() => {}} />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-8">
              <div className="text-center">
                <ChevronRight size={48} className="mx-auto mb-4 text-zinc-600" />
                <p className="text-zinc-400 text-sm">
                  发送消息以开始生成工作流
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Helper function to initialize workflow steps
function initializeSteps() {
  return [
    {
      id: 'step_1',
      title: '信息采集',
      description: '收集用户输入的提示词、图片等信息',
      type: 'info_collection' as const,
      status: 'running' as const,
      input: {},
      isExpanded: true,
    },
    {
      id: 'step_2',
      title: '资源验证',
      description: '验证媒体资源和用户余额',
      type: 'validation' as const,
      status: 'pending' as const,
      input: {},
      isExpanded: false,
    },
    {
      id: 'step_3',
      title: '提示词优化',
      description: '使用LLM进行多语言翻译和细节补充',
      type: 'optimization' as const,
      status: 'pending' as const,
      input: {},
      isExpanded: false,
    },
    {
      id: 'step_4',
      title: '视频生成',
      description: '提交到Kling进行异步视频生成',
      type: 'generation' as const,
      status: 'pending' as const,
      input: {},
      isExpanded: false,
    },
    {
      id: 'step_5',
      title: '结果保存',
      description: '保存视频结果到项目',
      type: 'finalization' as const,
      status: 'pending' as const,
      input: {},
      isExpanded: false,
    },
  ];
}
