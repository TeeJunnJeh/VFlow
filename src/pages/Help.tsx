import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Info } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../services/auth';
import { setMetaDescription } from '../utils/seo';

type HelpSection = {
  id: string;
  title: string;
  navLabel: string;
  markdown: string;
};

type HelpTopPageKey = 'guide' | 'scenarios' | 'faq' | 'terms' | 'changelog' | 'pricing';
type HelpTopPage = {
  key: HelpTopPageKey;
  label: string;
};

const getSectionIdFromHash = (hash: string) => {
  const normalized = (hash || '').trim();
  if (!normalized) return '';
  return normalized.startsWith('#') ? normalized.slice(1) : normalized;
};

const HelpPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, theme, setTheme, updateUser } = useAuth();
  const [activeSectionId, setActiveSectionId] = React.useState('overview');
  const nextTheme = theme === 'light' ? 'dark' : 'light';
  const topPages = React.useMemo<HelpTopPage[]>(() => ([
    { key: 'guide', label: '使用指南' },
    { key: 'scenarios', label: '场景示例' },
    { key: 'faq', label: '常见问题' },
    { key: 'terms', label: '条款与协议' },
    { key: 'changelog', label: '更新日志' },
    { key: 'pricing', label: '定价说明' },
  ]), []);

  const activeTopPageKey = React.useMemo<HelpTopPageKey>(() => {
    const path = (location.pathname || '').replace(/\/+$/, '');
    const parts = path.split('/').filter(Boolean);
    const helpIdx = parts.lastIndexOf('help');
    const candidate = helpIdx >= 0 ? parts[helpIdx + 1] : '';
    const keys = new Set<HelpTopPageKey>(topPages.map((p) => p.key));
    if (candidate && keys.has(candidate as HelpTopPageKey)) return candidate as HelpTopPageKey;
    return 'guide';
  }, [location.pathname, topPages]);

  const markdownComponents = React.useMemo(() => {
    const mutedText = theme === 'light' ? 'text-slate-600' : 'text-zinc-400';
    const bodyText = theme === 'light' ? 'text-slate-800' : 'text-zinc-200';
    const cardBg = theme === 'light' ? 'bg-white/70 border-slate-900/10' : 'bg-black/20 border-white/10';
    const codeBg = theme === 'light' ? 'bg-slate-900/5 text-slate-800' : 'bg-white/5 text-zinc-100';
    const preBg = theme === 'light' ? 'bg-slate-900/5 border-slate-900/10' : 'bg-black/30 border-white/10';
    const headingText = theme === 'light' ? 'text-slate-900' : 'text-zinc-100';
    const quoteText = theme === 'light' ? 'text-orange-950' : 'text-orange-100';
    const imageBorder = theme === 'light' ? 'border-slate-900/10' : 'border-white/10';

    return {
      h3: (props: any) => (
        <h3 className={['mt-8 mb-3 text-base font-black tracking-tight', headingText].join(' ')} {...props} />
      ),
      p: (props: any) => (
        <p className={[bodyText, 'leading-8 text-[15px] mt-3'].join(' ')} {...props} />
      ),
      ul: (props: any) => (
        <ul className={[bodyText, 'mt-3 space-y-2 pl-5 list-disc marker:text-orange-400/80'].join(' ')} {...props} />
      ),
      ol: (props: any) => (
        <ol className={[bodyText, 'mt-3 space-y-2 pl-5 list-decimal marker:text-orange-400/80'].join(' ')} {...props} />
      ),
      li: (props: any) => (
        <li className="leading-7" {...props} />
      ),
      blockquote: ({ children, ...props }: any) => (
        <blockquote
          className={[
            'mt-4 rounded-2xl border border-orange-500/30 bg-orange-500/10 px-4 py-3',
            quoteText,
          ].join(' ')}
          {...props}
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-orange-500/30 bg-orange-500/10 text-orange-500 shrink-0">
              <Info className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 [&>p]:mt-0 [&>p]:text-inherit [&>p]:leading-7">
              {children}
            </div>
          </div>
        </blockquote>
      ),
      a: (props: any) => (
        <a className="text-orange-400 hover:text-orange-300 transition-colors underline underline-offset-4" {...props} />
      ),
      code: ({ inline, className, children, ...props }: any) => {
        if (!inline) {
          return (
            <code className={[className, bodyText].filter(Boolean).join(' ')} {...props}>
              {children}
            </code>
          );
        }
        return (
          <code
            className={[
              'px-1.5 py-0.5 rounded-md text-[12px] font-mono border',
              codeBg,
              theme === 'light' ? 'border-slate-900/10' : 'border-white/10',
            ].join(' ')}
            {...props}
          >
            {children}
          </code>
        );
      },
      pre: (props: any) => (
        <pre
          className={[
            'mt-4 rounded-2xl border p-4 overflow-auto text-[12px] leading-6',
            preBg,
            theme === 'light' ? 'text-slate-800' : 'text-zinc-100',
          ].join(' ')}
          {...props}
        />
      ),
      img: ({ className, alt, ...props }: any) => (
        <img
          alt={alt || ''}
          className={[
            'mt-4 w-full max-w-3xl rounded-2xl border',
            imageBorder,
            className,
          ].filter(Boolean).join(' ')}
          {...props}
        />
      ),
      hr: () => (
        <hr className={['my-10', theme === 'light' ? 'border-slate-900/10' : 'border-white/10'].join(' ')} />
      ),
      table: (props: any) => (
        <div className={['mt-4 overflow-auto rounded-2xl border', theme === 'light' ? 'border-slate-900/10' : 'border-white/10'].join(' ')}>
          <table className="w-full text-left" {...props} />
        </div>
      ),
      th: (props: any) => (
        <th className={[theme === 'light' ? 'bg-slate-900/5 text-slate-700' : 'bg-black/30 text-zinc-200', 'p-3 text-xs font-bold uppercase tracking-widest'].join(' ')} {...props} />
      ),
      td: (props: any) => (
        <td className={[theme === 'light' ? 'border-slate-900/10 text-slate-800' : 'border-white/10 text-zinc-200', 'border-t p-3 text-sm'].join(' ')} {...props} />
      ),
    };
  }, [theme]);

  const sectionsByPage = React.useMemo<Record<HelpTopPageKey, HelpSection[]>>(() => {
    const videoGuideImage = '/help-page-demo/video_demo1.png';
    const map: Record<HelpTopPageKey, HelpSection[]> = {
      guide: [
        {
          id: 'overview',
          title: '产品介绍',
          navLabel: '产品介绍',
          markdown: [
            '**VFLOW AI** 是一款面向电商卖家与内容创作者的智能创作工具，帮助你将商品信息快速转化为可发布的视频与图片素材。',
            '你可以基于商品图片、商品信息、卖点文本等，自动生成视频与图片素材，并在工作台完成管理与导出， 或者发布到Tiktok等相关平台。',
            '- **一键生成**：从素材到脚本到成片，减少重复劳动',
            '- **工作流可控**：关键步骤可编辑、可回溯、可迭代',
            '- **素材管理**：统一管理资产、历史任务与导出结果',
            '- **适配平台**：面向 TikTok 短视频发布场景',
          ].join('\n'),
        },
        {
          id: 'quickstart',
          title: '快速开始',
          navLabel: '快速开始',
          markdown: [
            '1. [进入工作台](/app)，选择你要进行的创作模式。',
            '2. 上传/选择素材或填写商品信息，确保关键信息完整（品类、卖点、风格等）。',
            '3. 选择模型与参数，发起生成任务并在任务面板查看进度。',
            '4. 预览结果，按需编辑脚本、镜头、字幕与导出配置。',
            '5. 导出成片与素材，发布到目标平台。',
            '',
          ].join('\n'),
        },
        {
          id: 'video_generation',
          title: '视频生成',
          navLabel: '视频生成',
          markdown: [
            '视频生成用于将商品信息与素材快速组合为可发布的短视频成片。本平台集成了当前最新的视频生成模型，支持自定义模板与参数调整。可用模型包括[可灵](https://kling.ai/)、[Seedance](https://seed.bytedance.com/zh/seedance2_0)等。',
            '',
            '### 推荐流程',
            '',
            '1. 进入[工作台](/app)，按需选择视频生成的模型(目前支持Seedance2.0, 可灵o1, Sora目前已下线)',
            '',
            `![视频生成工作台示意图](${videoGuideImage})`,
            '',
            '2. 准备素材：主图、细节、上身/使用场景或参考视频。',
            '3. 填写卖点与约束：目标人群、风格、语气、禁词/必含信息等。',
            '4. 点击“生成脚本”, 等待后台自动生成脚本完成',
            '5. 预览并微调脚本/镜头/字幕，导出后发布到 TikTok 等平台。',
            '',
          ].join('\n'),
        },
        {
          id: 'image_generation',
          title: '图片生成',
          navLabel: '图片生成',
          markdown: [
            '图片生成用于产出电商可用的商品图（如换装、首帧、修复、套图等）。',
            '',
            '### 常见用法',
            '',
            '- **首帧/封面**：为视频生成统一的封面风格，提高点击率',
            '- **智能修复**：去噪/补全/细节增强，提升商品图质感',
            '- **商品套图**：多场景/多角度批量生成，保持店铺视觉一致',
            '',
            '### 注意事项',
            '',
            '- 素材清晰、主体突出，避免过度压缩与复杂背景',
            '- 服装类尽量提供平铺/上身图，细节纹理更稳定',
            '- 同一商品建议固定一套光影与配色，再扩展不同场景',
          ].join('\n'),
        },
        {
          id: 'support',
          title: '联系与支持',
          navLabel: '联系支持',
          markdown: [
            '如果你遇到功能异常、计费疑问或需要商务合作，请通过以下方式联系我们：',
            '',
            '- Email：`support@vflow.ai`',
            '- Business：`biz@vflow.ai`',
            '',
            '> 为了更快定位问题，反馈时请附上：发生时间、操作步骤、截图/录屏、浏览器与系统版本。',
          ].join('\n'),
        },
      ],
      scenarios: [
        {
          id: 'ecommerce',
          title: '电商带货场景',
          navLabel: '电商带货',
          markdown: [
            '适用于：商品详情页素材较完整，希望快速产出多版本短视频用于投放/自然流。',
            '',
            '推荐流程：',
            '',
            '1. 准备 5-10 张商品图（主图、细节、上身/使用场景）+ 3 条核心卖点。',
            '2. 在工作台选择适合的模板或创作模式，生成 2-3 个开头版本。',
            '3. 对比开头 3 秒停留率，保留表现更好的版本再扩展镜头与字幕。',
          ].join('\n'),
        },
        {
          id: 'ugc',
          title: 'UGC/口播场景',
          navLabel: 'UGC/口播',
          markdown: [
            '适用于：强调“真实体验/对比/测评”表达，内容更像达人讲解。',
            '',
            '要点：',
            '',
            '- 开头直给痛点（例如：油皮脱妆、显胖、收纳困难）',
            '- 用 1-2 个对比镜头承接卖点',
            '- 结尾给明确 CTA（优惠、链接、评论区）',
          ].join('\n'),
        },
        {
          id: 'multivariant',
          title: '批量多版本 A/B',
          navLabel: '多版本 A/B',
          markdown: [
            '适用于：同一商品需要多语言、多风格、多卖点组合测试。',
            '',
            '建议：',
            '',
            '- 固定一个变量（开头/卖点顺序/字幕风格）逐个测试',
            '- 每次生成 3-5 个版本即可，避免一次生成过多导致决策困难',
          ].join('\n'),
        },
      ],
      faq: [
        {
          id: 'login',
          title: '需要登录才能用吗？',
          navLabel: '是否需要登录',
          markdown: [
            '你可以直接进入工作台开始体验流程；部分能力在未登录状态可能会受限，具体以页面提示为准。',
          ].join('\n'),
        },
        {
          id: 'pricing_faq',
          title: '费用如何计算？',
          navLabel: '费用计算',
          markdown: [
            '计费与模型能力、生成类型（图片/视频/脚本）以及资源消耗相关。',
            '更准确的实时单价以产品内 Billing 为准。',
          ].join('\n'),
        },
        {
          id: 'quality',
          title: '如何提升生成质量？',
          navLabel: '提升质量',
          markdown: [
            '- 提供清晰、主体突出、光线稳定的素材',
            '- 卖点描述尽量具体（材质/功能/场景/对比优势）',
            '- 先做短流程验证节奏，再扩展到更长结构',
          ].join('\n'),
        },
      ],
      terms: [
        {
          id: 'agreements',
          title: '条款与协议',
          navLabel: '条款与协议',
          markdown: [
            '相关法律条款与隐私政策请参考：',
            '',
            '- [服务条款](/terms-of-service)',
            '- [隐私政策](/privacy-policy)',
          ].join('\n'),
        },
      ],
      changelog: [
        {
          id: 'recent',
          title: '更新日志',
          navLabel: '更新日志',
          markdown: [
            '这里展示产品主要功能更新与体验优化记录。',
            '',
            '### 近期更新',
            '',
            '- 优化帮助中心阅读体验（主题切换、导航、Markdown 排版）',
            '- 工作台导航与交互细节优化',
          ].join('\n'),
        },
      ],
      pricing: [
        {
          id: 'pricing_overview',
          title: '定价说明',
          navLabel: '定价说明',
          markdown: [
            '计费通常与使用的模型能力、生成的类型（图片/视频/脚本等）以及资源消耗相关。',
            '你可以在工作台与 Billing 页面查看更准确的实时单价与套餐信息。',
            '',
            '- **按量计费**：按生成次数或生成时长计费，适合不定期使用',
            '- **套餐/订阅**：包含一定额度与权益，适合持续产出团队',
            '- **企业方案**：可定制并发、额度、权限与对接方式',
            '',
            '> 如需更详细的费用口径（例如某个模型、某条工作流的具体单价），建议以产品内的 Billing 展示为准。',
          ].join('\n'),
        },
      ],
    };

    return map;
  }, []);

  const sections = sectionsByPage[activeTopPageKey];

  React.useEffect(() => {
    if (typeof document !== 'undefined') document.title = 'VFLOW AI - 帮助中心';
    setMetaDescription('VFLOW AI 帮助中心：产品介绍、使用方式、定价说明与联系支持。');
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const path = (location.pathname || '').replace(/\/+$/, '');
    if (path !== '/help') return;
    const first = sections[0]?.id || 'overview';
    navigate(`/help/${activeTopPageKey}#${first}`, { replace: true });
    setActiveSectionId(first);
  }, [activeTopPageKey, location.pathname, navigate, sections]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const first = sections[0]?.id;
    if (!first) return;
    const next = getSectionIdFromHash(location.hash);
    if (next) return;
    const el = document.getElementById(first);
    if (!el) return;
    el.scrollIntoView({ behavior: 'auto', block: 'start' });
    setActiveSectionId(first);
  }, [activeTopPageKey, location.hash, sections]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const next = getSectionIdFromHash(location.hash);
    if (!next) return;
    const el = document.getElementById(next);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.hash]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => (b.intersectionRatio || 0) - (a.intersectionRatio || 0));
        const top = visible[0];
        const id = (top?.target as HTMLElement | undefined)?.id;
        if (id) setActiveSectionId(id);
      },
      { root: null, rootMargin: '-20% 0px -70% 0px', threshold: [0.05, 0.1, 0.25, 0.5] }
    );

    for (const section of sections) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100">
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-sm">
        <div className="w-full px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-orange-500 flex items-center justify-center font-bold italic text-black shadow-lg shadow-orange-500/20 shrink-0">
              VF
            </div>
            <div className="min-w-0">
              <div className="text-lg md:text-xl font-semibold">帮助中心</div>
              <div className="text-xs text-zinc-400">产品介绍 · 使用方式 · 定价 · 联系支持</div>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                setTheme(nextTheme);
                updateUser({ theme: nextTheme });
                if (user) {
                  void authApi.updateProfile({ theme: nextTheme }).catch(() => {
                  });
                }
              }}
              className="h-10 px-3 rounded-xl border border-white/10 bg-black/20 hover:bg-black/40 transition text-sm text-zinc-200"
            >
              切换到{nextTheme === 'light' ? '白天' : '夜间'}
            </button>
            <Link to="/" className="text-sm text-orange-400 hover:text-orange-300 transition-colors">
              返回首页
            </Link>
          </div>
        </div>
        <div className="w-full px-6 pb-2">
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 overflow-hidden">
            {topPages.map((p) => {
              const active = p.key === activeTopPageKey;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => {
                    const first = sectionsByPage[p.key]?.[0]?.id || 'overview';
                    navigate(`/help/${p.key}#${first}`);
                    setActiveSectionId(first);
                  }}
                  className={[
                    'relative pb-3 text-sm font-bold whitespace-nowrap transition-colors',
                    active ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-200',
                  ].join(' ')}
                >
                  {p.label}
                  {active ? <span className="absolute left-0 right-0 -bottom-[1px] h-0.5 bg-orange-500 rounded-full" /> : null}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <div className="flex flex-col min-h-[calc(100vh-73px)]">
        <div className="flex flex-1 min-h-0 bg-zinc-950">
        <aside className="w-72 shrink-0 border-r border-white/10 bg-zinc-950">
          <div className="sticky top-0 p-4">
            <nav className="flex flex-col gap-1">
              {sections.map((section) => {
                const isActive = activeSectionId === section.id;
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => {
                      if (typeof window === 'undefined') return;
                      const el = document.getElementById(section.id);
                      window.history.replaceState(null, '', `#${section.id}`);
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      setActiveSectionId(section.id);
                    }}
                    className={[
                      'w-full text-left rounded-xl px-3 py-2 text-sm transition border',
                      isActive
                        ? 'border-orange-500/40 bg-orange-500/10 text-orange-200'
                        : 'border-transparent text-zinc-300 hover:bg-white/5 hover:border-white/10',
                    ].join(' ')}
                  >
                    {section.navLabel}
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        <main className="flex-1 min-w-0 px-6 sm:px-10 py-10 bg-zinc-950">
          <div className="w-full max-w-4xl">
            {sections.map((section, idx) => (
              <section
                key={section.id}
                id={section.id}
                className={['scroll-mt-24', idx === 0 ? '' : 'mt-12'].join(' ')}
              >
                <div className="flex items-end justify-between gap-4">
                  <h2
                    className={[
                      'text-3xl font-black tracking-tight',
                      theme === 'light' ? 'text-slate-900' : 'text-zinc-100',
                    ].join(' ')}
                  >
                    {section.title}
                  </h2>
                </div>

                <div className={[
                  'mt-4',
                  theme === 'light' ? 'text-slate-800' : 'text-zinc-200',
                ].join(' ')}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {section.markdown}
                  </ReactMarkdown>
                </div>
              </section>
            ))}
          </div>
        </main>
        </div>

        <footer className="border-t border-white/10 py-6 text-center bg-zinc-950">
          <div className="flex flex-col items-center gap-1">
            <a
              href="http://beian.miit.gov.cn"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              粤ICP备2026027661号
            </a>
            <div className="text-xs text-zinc-500">深圳智佳景科技有限公司 All rights reserved.</div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default HelpPage;
