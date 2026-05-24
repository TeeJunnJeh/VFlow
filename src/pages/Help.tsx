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
    { key: 'pricing', label: '定价说明' },
    { key: 'terms', label: '条款与协议' },
    { key: 'changelog', label: '更新日志' },
    { key: 'faq', label: '常见问题' },
  ]), []);

  const activeTopPageKey = React.useMemo<HelpTopPageKey>(() => {
    const path = (location.pathname || '').replace(/\/+$/, '');
    const parts = path.split('/').filter(Boolean);
    const helpIdx = parts.lastIndexOf('doc');
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
      a: ({ href, children, ...props }: any) => {
        const nextHref = String(href || '');
        const className = 'text-orange-400 hover:text-orange-300 transition-colors underline underline-offset-4';
        if (nextHref.startsWith('/')) {
          return (
            <Link to={nextHref} className={className}>
              {children}
            </Link>
          );
        }
        return (
          <a
            href={nextHref}
            target="_blank"
            rel="noopener noreferrer"
            className={className}
            {...props}
          >
            {children}
          </a>
        );
      },

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
    const scriptImage = '/help-page-demo/video_demo2.png';
    const videoPreviewImage = '/help-page-demo/video_demo3.png';
    const map: Record<HelpTopPageKey, HelpSection[]> = {
      guide: [
        {
          id: 'overview',
          title: '产品介绍',
          navLabel: '产品介绍',
          markdown: [
            '**VFLOW AI** 为[**深圳智佳景科技有限公司**](https://www.genviewtech.com/) 旗下的一款面向电商卖家与内容创作者的智能创作工具，帮助你将商品信息快速转化为可发布的视频与图片素材。',
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
            '',
            '1. [进入工作台](/app)，选择你要进行的创作模式。',
            '2. 上传/选择素材或填写商品信息，确保关键信息完整（品类、卖点、风格等）。',
            '3. 选择模型与参数，发起生成任务并在任务面板查看进度。',
            '4. 预览结果，按需编辑脚本、镜头、字幕与导出配置。',
            '5. 导出成片与素材，发布到目标平台。',
            '',
            '也可以使用 [AI 创作](/app?view=ai_creator) 通过对话快速开始第一条视频/第一张图片的生成。',
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
            '4. 点击“生成分镜脚本”, 等待后台自动生成脚本完成',
            '',
            `![生成脚本示意](${scriptImage})`,
            '',
            '5. 预览并微调脚本，并点击生成视频，生成完成后可在右侧进行预览，或者导出视频素材、发布到 TikTok 等平台。',
            '',
            `![生成视频并发布示意](${videoPreviewImage})`,
            '',
          ].join('\n'),
        },
        {
          id: 'image_generation',
          title: '图片生成',
          navLabel: '图片生成',
          markdown: [
            '图片生成用于产出电商可用的商品图（如换装、首帧、修复、套图等）。目前可用的生图模型包括Flux、谷歌的nanobana pro等，后续将考虑接入最新的GPT image 2模型。',
            '',
            '### 基本功能',
            '',
            '- **[AI 换装](/app?view=product_images_clothing_swap)**：快速替换服饰上身效果，生成更贴近真实试穿的商品展示图',
            '- **[AI 首帧图](/app?view=product_images_first_frame)**：生成视频封面/首帧主图，统一风格并提升点击率',
            '- **[AI 智能修复](/app?view=product_images_smart_repair)**：去噪、补全与细节增强，改善清晰度与质感',
            '- **[AI 商品套图](/app?view=product_images_gallery)**：按场景/角度批量生成多张商品图，保持店铺视觉一致性',
            '- **[AI 海报编辑](/app?view=product_images_gallery&poster_editor=1)**：基于商品信息自动排版与生成海报图，快速出图并提升表现',
            '- **[AI 模特](/app?view=product_images_ai_model)**：生成/替换商品展示图中的模特形象，提升场景表现与转化效果',
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
            '- 报错反馈： error@genviewtech.com',
            '- Email：contact@cvml.tsinghua.edu.cn',
            '- 小红书：[智佳景VFlow AI](https://www.xiaohongshu.com/user/profile/5bf03ae4b6db43000137efe0?xsec_token=YBg2sg9LoyoNxU8oFsYttdCtGK1Wvhikm8P6TJ3vP2L7U=&xsec_source=app_share&xhsshare=WeixinSession&appuid=5d7779e2000000000101be63&apptime=1778140718&share_id=34dd625de0294e119328beec004cb1cf)',
            '- 另外，十分欢迎用户填写我们的反馈问卷，我们将认真阅读每一份问卷的内容，并进行相应功能的优化，您的反馈将帮助我们更好地服务您。**填写问卷后将会赠送一定量V点到您手机号所对应的账户下**。[问卷链接](https://qcnqf0zbnr43.feishu.cn/share/base/form/shrcnI1xuSaovPpGRVjcCkVx2ab)',
            '',
            '> 为了更快定位问题，反馈时请附上：发生时间、操作步骤、截图/录屏、浏览器与系统版本。',
          ].join('\n'),
        },
      ],
      scenarios: [
        {
          id: 'product_gallery',
          title: 'AI 商品套图',
          navLabel: 'AI 商品套图',
          markdown: [
            '这里展示一个可直接在 **AI 商品套图** 中复刻的“场景示例”。你可以按同样输入快速得到一致风格的套图结果。',
            '',
            '### 示例复刻：场景种草',
            '',
            '**输入**',
            '',
            '- 商品图（示例）',
            '',
            `![输入商品图 1](/product-gallery-examples/2/product_1.webp)`,
            '',
            `![输入商品图 2](/product-gallery-examples/2/product_2.png)`,
            '',
            '**怎么复刻（在原功能区操作，原位置不变）**',
            '',
            '1. 打开 [AI 商品套图](/app?view=product_images_gallery)。',
            '2. 在页面顶部“示例案例”里点击 **场景种草**。',
            '3. 系统会自动填充：商品信息 / 卖点 / 场景与风格 / 出图卡（比例、分辨率、布局等）。',
            '4. 直接点击生成，或先微调场景描述与布局后再生成。',
            '',
            '**输出（示例结果）**',
            '',
            `![输出示例 1](/product-gallery-examples/2/result_1.jpeg)`,
            '',
            `![输出示例 2](/product-gallery-examples/2/result_2.jpeg)`,
            '',
            `![输出示例 3](/product-gallery-examples/2/result_3.jpeg)`,
          ].join('\n'),
        },
        {
          id: 'poster_editing',
          title: 'AI 海报编辑',
          navLabel: 'AI 海报编辑',
          markdown: [
          ].join('\n'),
        },
        {
          id: 'ai_clothing',
          title: 'AI 换装',
          navLabel: 'AI 换装',
          markdown: [
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
          id: 'quality',
          title: '如何提升生成质量？',
          navLabel: '提升质量',
          markdown: [
            '- 提供清晰、主体突出、光线稳定的素材',
            '- 卖点描述尽量具体（材质/功能/场景/对比优势）',
            '- 先做短流程验证节奏，再扩展到更长结构',
          ].join('\n'),
        },
        {
          id: 'more',
          title: '欢迎反馈',
          navLabel: '欢迎反馈',
          markdown: [
            '如果您有更多问题, 欢迎随时联系我们。联系邮箱：error@genviewtech.com。',
            '共性问题将会被展示在此。您对产品的认可就是我们前进最大的动力！'
          ].join('\n'),
        }
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
          ].join('\n'),
        },
        {
          id: 'why_v_poing',
          title: '什么是V点',
          navLabel: '什么是V点',
          markdown: [
            'V 点是 VFLOW 内用于 AI 生成、编辑和重绘等功能的消耗单位。',
            '',
            '- 生成图片会按张消耗 V 点。',
            '- 生成视频**通常**会按秒消耗 V 点。',
            '- 部分模型会根据实际生成用量**在任务完成后结算**。',
            '- 如果任务失败（例如，因为网络因素导致生产失败、因为素材质量/版权问题导致生产失败），已扣除的 V 点会按系统规则退回。',
            '',
            '当前的充值规则为：**1 元 = 10 V 点**',
          ].join('\n'),
        },
        {
          id: 'pic_gen',
          title: '图片生成计费',
          navLabel: '图片生成计费',
          markdown: [
            '图片类功能通常按“每张图片”计费。',
            '| 功能 | 模型 | 计费方式 | 当前价格 |',
            '| --- | --- | --- | --- |',
            '| 商品套图生成、首帧图生成、AI 智能优化 | Flux Pro | 按张计费 | 9.9 V / 张 |',
            '| 商品套图生成、首帧图生成 | Flux Flex | 按张计费 | 0.9 V / 张 |',
            '| AI 海报编辑、文本重绘 | Gemini Nano Banana | 按张计费 | 9.9 V / 张 |',
            '| 商品套图生成、首帧图生成 | GPT Image | 按张计费 | 9.9 V / 张 |',
            '',
          ].join('\n'),
        },
        {
          id: 'video_gen',
          title: '视频生成计费',
          navLabel: '视频生成计费',
          markdown: [
            '视频生成通常按“视频时长”计费。',
            '| 功能 | 模型 | 计费方式 | 当前价格 |',
            '| --- | --- | --- | --- |',
            '| 视频生成-极速出片 | Kling | 按秒计费 | 7.9 V / 秒 |',
            '| 视频生成-极速出片 | Sora 2 | 按秒计费 | 6.9 V / 秒 |',
            '| 视频生成-极速出片 | Sora 2 Pro | 按秒计费 | 21.9 V / 秒 |',
            '',
            '> **注意：** OPENAI 于 2026 年 3 月 24 日关停旗下视频生成服务 Sora2.0，目前 Sora 2 相关生成服务无法使用。',
            '',
            '视频生成的预估消耗为：模型单秒价格 × 视频时长。',
            '',
            '**例如：** 使用 Kling 生成 5 秒视频：',
            '消耗 V 点 = 7.9 V × 5 = 39.5 V',
          ].join('\n'),
        },
        {
          id: 'seedance_pricing',
          title: 'Seedance 计费方式',
          navLabel: 'Seedance 计费方式',
          markdown: [
            'Seedance 模型采用“生成完成后按实际用量结算”的方式。这意味着：',
            '- 提交任务时，系统只会检查账户中是否有可用 V 点，不会扣除完整费用。',
            '- 任务完成后，系统会根据模型返回的实际用量进行结算。',
            '- 最终扣费会记录在 V 点流水中。',
            '',
            'Seedance 的实际消耗主要由模型返回的实际用量决定。系统会在任务完成后读取 Seedance 的实际 token 用量，再按照分辨率和是否包含视频输入计算费用。',
            '',
            'Seedance 相关功能的基础价格如下：',
            '| 功能 | 模型 | 生成配置 | 无视频输入 | 有视频输入 |',
            '| --- | --- | --- | --- | --- |',
            '| 视频生成-极速出片 | Seedance 2.0 | 480p / 720p | 460 V / 百万 tokens | 280 V / 百万 tokens |',
            '| 视频生成-极速出片 | Seedance 2.0 | 1080p / 其他分辨率 | 510 V / 百万 tokens | 310 V / 百万 tokens |',
            '',
            '最终，系统会将结果向上取整到 0.1 V，最低扣费为 0.1 V。',
            '',
            '因此，Seedance 生成前展示的费用可能是提示性信息，最终以生成完成后的账单记录为准',
          ].join('\n'),
        },
        {
          id: 'deduction_refund',
          title: '扣费和退款',
          navLabel: '扣费和退款',
          markdown: [
            '一般情况下：',
            '- 对于图片生成和按秒计费视频任务，会根据选择的模型和用量计算费用，在任务提交时扣除费用。',
            '- Seedance 会在任务完成后按实际用量结算。',
            '- 如果任务失败，系统会根据失败情况退回对应 V 点。',
            '',
            '可以在个人中心或账单流水中查看：',
            '- 扣费时间',
            '- 扣费功能和使用模型',
            '- 消耗 V 点',
            '- 退款记录',
          ].join('\n'),
        },
        {
          id: 'notes',
          title: '注意事项',
          navLabel: '注意事项',
          markdown: [
            '- 页面展示的预计费用用于帮助用户判断大致消耗，实际扣费以任务完成后的系统账单为准。',
            '- 不同模型的价格可能会根据服务成本调整。',
            '- 如果价格发生变化，新的价格只影响之后创建的新任务。',
          ].join('\n'),
        },
      ],
    };

    return map;
  }, []);

  const sections = sectionsByPage[activeTopPageKey];

  React.useEffect(() => {
    if (typeof document !== 'undefined') document.title = 'VFLOW AI - 帮助中心 - GenViewTech';
    setMetaDescription('VFLOW AI 帮助中心：产品介绍、使用方式、定价说明与联系支持。');
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const path = (location.pathname || '').replace(/\/\/+$/, '');
    if (path !== '/doc') return;
    const first = sections[0]?.id || 'overview';
    navigate(`/doc/${activeTopPageKey}#${first}`, { replace: true });
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
              <div className="text-lg md:text-xl font-semibold">产品文档</div>
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
                    navigate(`/doc/${p.key}#${first}`);
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
            <div className="text-xs text-zinc-500">© 2026 深圳智佳景科技有限公司. All rights reserved.</div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default HelpPage;
