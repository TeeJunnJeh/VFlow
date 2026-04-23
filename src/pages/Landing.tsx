import React from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Shield, Lock, Sparkles, ShoppingCart, Globe, Clock, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { useLanguage } from '../context/LanguageContext';
import { LanguageSwitcher } from '../components/common/LanguageSwitcher';
import TransitionOverlay from '../components/common/TransitionOverlay';
import { AppDialog } from '../components/common/AppDialog';
import { authApi } from '../services/auth';
import { getDebugModeEnabled, setDebugModeEnabled } from '../services/debugMode';

// --- 流星背景组件 (保持优化后的硬件加速配置) ---
const MeteorBackground = () => {
  const meteors = Array.from({ length: 16 });
  return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        {meteors.map((_, i) => (
            <span
                key={i}
                className="absolute h-[1px] w-[150px] bg-gradient-to-r from-violet-500 via-purple-400/50 to-transparent animate-shooting-star"
                style={{
                  top: `${Math.random() * 100}%`,
                  left: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * -10}s`,
                  animationDuration: `${Math.random() * 2 + 2}s`,
                }}
            />
        ))}
      </div>
  );
};

const LandingPage = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isDebugDialogOpen, setIsDebugDialogOpen] = useState(false);
  const [debugPassword, setDebugPassword] = useState('');
  const [isDebugSubmitting, setIsDebugSubmitting] = useState(false);
  const [debugError, setDebugError] = useState('');
  const [isDebugModeEnabled, setIsDebugModeEnabledState] = useState(getDebugModeEnabled());

  React.useEffect(() => {
    let mounted = true;
    const syncDebugMode = async () => {
      try {
        const enabled = await authApi.getDebugModeStatus();
        if (!mounted) return;
        setIsDebugModeEnabledState(enabled);
        setDebugModeEnabled(enabled);
      } catch {
        if (!mounted) return;
        setIsDebugModeEnabledState(getDebugModeEnabled());
      }
    };

    void syncDebugMode();
    return () => {
      mounted = false;
    };
  }, []);

  const handleStart = () => {
    setIsTransitioning(true);
    // 缩短跳转感官时间，450ms 是人类视觉残留最舒适的转场点
    setTimeout(() => {
      navigate('/app');
    }, 450);
  };

  const handleDebugModeToggle = async () => {
    if (isDebugModeEnabled) {
      setIsDebugSubmitting(true);
      setDebugError('');
      try {
        await authApi.setDebugMode({ enabled: false });
        setDebugModeEnabled(false);
        setIsDebugModeEnabledState(false);
      } catch (err: any) {
        setDebugError(err?.message || '退出调试模式失败');
      } finally {
        setIsDebugSubmitting(false);
      }
      return;
    }

    setIsDebugDialogOpen(true);
  };

  const handleEnterDebugMode = async () => {
    if (!debugPassword.trim()) {
      setDebugError('请输入调试密码');
      return;
    }

    setIsDebugSubmitting(true);
    setDebugError('');
    try {
      const enabled = await authApi.setDebugMode({ enabled: true, password: debugPassword.trim() });
      setDebugModeEnabled(enabled);
      setIsDebugModeEnabledState(enabled);
      setIsDebugDialogOpen(false);
      setDebugPassword('');
      navigate('/login');
    } catch (err: any) {
      setDebugError(err?.message || '调试密码错误');
    } finally {
      setIsDebugSubmitting(false);
    }
  };

  // 标题文字交错入场
  const titleContainer: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.15, delayChildren: 0.2 }
    }
  };

  const titleItem: Variants = {
    hidden: { y: 40, opacity: 0 },
    show: { y: 0, opacity: 1, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] as const } }
  };

  return (
      <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{
            opacity: 0,
            scale: 0.98,
            transition: { duration: 0.4 }
          }}
          className="min-h-screen bg-[#050505] text-white overflow-hidden relative font-sans selection:bg-violet-500/30"
      >
        {/* 1. 更加自然的转场层 */}
        <AnimatePresence>
          {isTransitioning && <TransitionOverlay key="overlay" />}
        </AnimatePresence>

        {/* 2. 背景层：转场开始时可保持渲染，但光晕会覆盖它 */}
        <MeteorBackground />

        {/* 呼吸网格 */}
        <motion.div
            animate={{ opacity: [0.2, 0.4, 0.2] }}
            transition={{ duration: 6, repeat: Infinity }}
            className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_at_center,black:45%,transparent_100%)] pointer-events-none"
        />
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-violet-600/10 rounded-full blur-[140px] pointer-events-none" />

        {/* --- Navbar --- */}
        <nav className="relative z-50 px-10 py-8 flex items-center justify-between max-w-7xl mx-auto">
          <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-violet-600 to-orange-500 flex items-center justify-center shadow-2xl shadow-violet-500/30" />
            <span className="text-2xl font-black tracking-tighter uppercase italic">VFlow AI</span>
          </motion.div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => void handleDebugModeToggle()}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-bold transition ${isDebugModeEnabled ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20' : 'border-white/10 bg-white/5 text-white hover:bg-white/10'}`}
            >
              <Shield size={16} />
              {isDebugModeEnabled ? '退出调试模式' : '进入调试模式'}
            </button>
            <LanguageSwitcher />
            <button
                onClick={handleStart}
                className="px-6 py-2.5 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition-all text-sm font-bold tracking-wide"
            >
              {t.landing_btn_login}
            </button>
          </div>
        </nav>

        {/* --- Hero Section --- */}
        <main className="relative z-10 flex flex-col items-center justify-center min-h-[85vh] text-center px-4 overflow-visible">
          <motion.h1
              variants={titleContainer}
              initial="hidden"
              animate="show"
              className="flex flex-col md:flex-row items-center justify-center overflow-visible mb-8 gap-0 md:gap-2"
          >
            <motion.span variants={titleItem} className="text-7xl md:text-[140px] font-black italic tracking-tighter text-white inline-block px-10 -mx-8 drop-shadow-[0_5px_15px_rgba(0,0,0,0.4)] leading-[1.05]">
              {t.landing_hero_title_1}
            </motion.span>

            <motion.span
                variants={titleItem}
                animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
                transition={{ backgroundPosition: { duration: 6, repeat: Infinity, ease: "linear" }, y: { duration: 0.8 }, opacity: { duration: 0.8 } }}
                style={{ backgroundSize: "200% 200%" }}
                className="text-7xl md:text-[140px] font-black italic tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-violet-400 via-pink-500 to-orange-400 inline-block px-10 md:px-20 -mx-10 py-4 leading-[1.05]"
            >
              {t.landing_hero_title_2}
            </motion.span>
          </motion.h1>

          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8, duration: 1 }} className="text-lg md:text-2xl text-slate-400 max-w-4xl mb-14 font-light leading-relaxed tracking-wide">
            {t.landing_subtitle}
          </motion.p>

          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 1.2, type: "spring", stiffness: 100 }} className="relative group">
            <div className="absolute -inset-1.5 bg-gradient-to-r from-violet-600 to-orange-500 rounded-2xl blur-lg opacity-25 group-hover:opacity-50 transition duration-700 animate-pulse" />
            <button
                onClick={handleStart}
                className="relative px-14 py-6 bg-gradient-to-r from-violet-600 to-pink-600 rounded-xl text-white font-black text-2xl shadow-[0_10px_40px_rgba(139,92,246,0.3)] hover:scale-105 active:scale-95 transition-all flex items-center gap-4 group"
            >
              {t.landing_cta_start}
              <ArrowRight size={32} className="group-hover:translate-x-3 transition-transform duration-300" />
            </button>
          </motion.div>
        </main>

        <section className="relative z-10 max-w-7xl mx-auto px-6 md:px-10 pb-20">
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight text-white">AI 视频生成，专为跨境电商与创作者</h2>
            <p className="mt-5 text-base md:text-lg text-slate-300 leading-relaxed">
              面向海外电商与个人创作者的 AI 视频生成神器：只需商品链接或图片，一键生成高转化率的 TikTok / Reels 爆款短视频。
              支持从脚本到画面渲染一体化工作流，让你更快产出、持续迭代、稳定投放。
            </p>
          </div>

          <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <div className="w-11 h-11 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center mb-4">
                <ShoppingCart size={20} className="text-violet-200" />
              </div>
              <h3 className="text-white font-extrabold text-lg">电商商品一键转视频</h3>
              <p className="mt-2 text-sm text-slate-300 leading-relaxed">商品链接/图片 → 自动生成卖点脚本与镜头结构。</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <div className="w-11 h-11 rounded-xl bg-orange-500/15 border border-orange-500/20 flex items-center justify-center mb-4">
                <Sparkles size={20} className="text-orange-200" />
              </div>
              <h3 className="text-white font-extrabold text-lg">爆款风格模板</h3>
              <p className="mt-2 text-sm text-slate-300 leading-relaxed">快速套用 TikTok / Reels 常见脚本结构与节奏。</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center mb-4">
                <Clock size={20} className="text-emerald-200" />
              </div>
              <h3 className="text-white font-extrabold text-lg">更快产出</h3>
              <p className="mt-2 text-sm text-slate-300 leading-relaxed">从素材到成片流程可视化，减少反复沟通与手工剪辑。</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <div className="w-11 h-11 rounded-xl bg-sky-500/15 border border-sky-500/20 flex items-center justify-center mb-4">
                <Globe size={20} className="text-sky-200" />
              </div>
              <h3 className="text-white font-extrabold text-lg">面向全球投放</h3>
              <p className="mt-2 text-sm text-slate-300 leading-relaxed">适配海外电商常用渠道与内容形态，助你极速出海。</p>
            </div>
          </div>

          <div className="mt-16 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8">
              <h2 className="text-2xl font-black text-white">怎么用</h2>
              <ol className="mt-5 space-y-4 text-slate-300">
                <li className="flex gap-3">
                  <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/10 border border-white/10 text-sm font-black text-white">1</span>
                  <div>
                    <div className="font-bold text-white">上传素材</div>
                    <div className="text-sm leading-relaxed">上传商品图/场景图，或准备商品链接与卖点信息。</div>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/10 border border-white/10 text-sm font-black text-white">2</span>
                  <div>
                    <div className="font-bold text-white">填写生成要求</div>
                    <div className="text-sm leading-relaxed">选择画幅比例、模型、输出数量等参数。</div>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/10 border border-white/10 text-sm font-black text-white">3</span>
                  <div>
                    <div className="font-bold text-white">一键生成并迭代</div>
                    <div className="text-sm leading-relaxed">预览结果，按投放反馈快速调整脚本、画面与节奏。</div>
                  </div>
                </li>
              </ol>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8">
              <h2 className="text-2xl font-black text-white">适用场景</h2>
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center gap-2 text-white font-extrabold">
                    <TrendingUp size={18} className="text-orange-200" />
                    <span>投放素材</span>
                  </div>
                  <div className="mt-1 text-sm text-slate-300 leading-relaxed">快速生成多版本素材，A/B 测试找出高转化组合。</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center gap-2 text-white font-extrabold">
                    <Lock size={18} className="text-violet-200" />
                    <span>新品冷启动</span>
                  </div>
                  <div className="mt-1 text-sm text-slate-300 leading-relaxed">从 0 到 1 批量产出讲卖点、讲场景的短视频。</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center gap-2 text-white font-extrabold">
                    <Shield size={18} className="text-emerald-200" />
                    <span>店铺内容矩阵</span>
                  </div>
                  <div className="mt-1 text-sm text-slate-300 leading-relaxed">统一风格输出，持续更新账号内容。</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center gap-2 text-white font-extrabold">
                    <Sparkles size={18} className="text-orange-200" />
                    <span>创作者灵感</span>
                  </div>
                  <div className="mt-1 text-sm text-slate-300 leading-relaxed">脚本与镜头结构可视化，快速获得创作方向。</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-16">
            <h2 className="text-2xl md:text-3xl font-black text-white text-center">精彩即将呈现</h2>
            <p className="mt-3 text-center text-sm md:text-base text-slate-300">
              案例展示区（占位）：左侧视频，右侧三张商品图。
            </p>

            <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-6">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:grid-rows-3">
                <div className="rounded-xl border border-white/10 bg-black/20 overflow-hidden lg:row-span-3">
                  <div className="w-full aspect-[9/16] lg:aspect-auto lg:h-full">
                    <video
                      src="/intro-page-demo/kling_7b04ff964d.mp4"
                      autoPlay
                      loop
                      muted
                      playsInline
                      preload="metadata"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 overflow-hidden">
                  <div className="w-full aspect-[16/9]">
                    <img
                      src="/intro-page-demo/anime_ip_after.jpg"
                      alt="案例图片 1"
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 overflow-hidden">
                  <div className="w-full aspect-[16/9]">
                    <img
                      src="/intro-page-demo/repainted.jpeg"
                      alt="案例图片 2"
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 overflow-hidden">
                  <div className="w-full aspect-[16/9]">
                    <img
                      src="/intro-page-demo/product_gallery_1776926764914.jpeg"
                      alt="案例图片 3"
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-16">
            <h2 className="text-2xl md:text-3xl font-black text-white text-center">定价</h2>
            <p className="mt-3 text-center text-sm md:text-base text-slate-300">
              先拟一个草稿版本，后续可按你的实际点数/套餐做精确调整。
            </p>

            <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-xl font-black text-white">视频生成</h3>
                  <span className="text-xs font-extrabold text-violet-200 border border-violet-500/20 bg-violet-500/10 px-3 py-1 rounded-full">
                    Video
                  </span>
                </div>

                <div className="mt-6 space-y-4">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-5">
                    <div className="flex items-baseline justify-between gap-4">
                      <div className="text-white font-extrabold">体验版</div>
                      <div className="text-slate-300 text-sm">￥0（限量）</div>
                    </div>
                    <ul className="mt-3 space-y-2 text-sm text-slate-300 leading-relaxed">
                      <li>适合：首次体验与 Demo</li>
                      <li>包含：基础模型 + 基础画幅</li>
                      <li>限制：排队优先级较低 / 输出数量受限</li>
                    </ul>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-5">
                    <div className="flex items-baseline justify-between gap-4">
                      <div className="text-white font-extrabold">标准版</div>
                      <div className="text-slate-300 text-sm">￥XX / 月（草稿）</div>
                    </div>
                    <ul className="mt-3 space-y-2 text-sm text-slate-300 leading-relaxed">
                      <li>适合：日常投放素材生产</li>
                      <li>包含：更高输出上限 + 更快生成</li>
                      <li>支持：批量生成、多版本 A/B 测试</li>
                    </ul>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-5">
                    <div className="flex items-baseline justify-between gap-4">
                      <div className="text-white font-extrabold">企业版</div>
                      <div className="text-slate-300 text-sm">联系报价</div>
                    </div>
                    <ul className="mt-3 space-y-2 text-sm text-slate-300 leading-relaxed">
                      <li>适合：团队协作与大规模投放</li>
                      <li>包含：更高并发 / 专属额度 / SLA</li>
                      <li>支持：自定义模型/流程（按需）</li>
                    </ul>
                  </div>
                </div>

                <button
                  onClick={handleStart}
                  className="mt-6 w-full px-10 py-4 rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 text-white font-black text-lg hover:scale-[1.02] active:scale-[0.99] transition-all inline-flex items-center justify-center gap-3"
                >
                  {t.landing_cta_start}
                  <ArrowRight size={20} />
                </button>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-xl font-black text-white">商品图片生成</h3>
                  <span className="text-xs font-extrabold text-orange-200 border border-orange-500/20 bg-orange-500/10 px-3 py-1 rounded-full">
                    Product Images
                  </span>
                </div>

                <div className="mt-6 space-y-4">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-5">
                    <div className="flex items-baseline justify-between gap-4">
                      <div className="text-white font-extrabold">基础版</div>
                      <div className="text-slate-300 text-sm">￥XX / 月（草稿）</div>
                    </div>
                    <ul className="mt-3 space-y-2 text-sm text-slate-300 leading-relaxed">
                      <li>适合：商品主图/场景图快速出图</li>
                      <li>包含：常用风格与尺寸</li>
                      <li>支持：批量生成、快速挑选</li>
                    </ul>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-5">
                    <div className="flex items-baseline justify-between gap-4">
                      <div className="text-white font-extrabold">专业版</div>
                      <div className="text-slate-300 text-sm">￥XX / 月（草稿）</div>
                    </div>
                    <ul className="mt-3 space-y-2 text-sm text-slate-300 leading-relaxed">
                      <li>适合：电商运营与创意团队</li>
                      <li>包含：更高出图上限 + 更快处理</li>
                      <li>支持：更多风格模板与工作区管理</li>
                    </ul>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-5">
                    <div className="flex items-baseline justify-between gap-4">
                      <div className="text-white font-extrabold">按量计费</div>
                      <div className="text-slate-300 text-sm">￥X / 张（草稿）</div>
                    </div>
                    <ul className="mt-3 space-y-2 text-sm text-slate-300 leading-relaxed">
                      <li>适合：偶尔使用或突发活动</li>
                      <li>按生成张数扣费，可灵活控制预算</li>
                    </ul>
                  </div>
                </div>

                <button
                  onClick={handleStart}
                  className="mt-6 w-full px-10 py-4 rounded-xl border border-white/10 bg-white/5 text-white font-black text-lg hover:bg-white/10 active:scale-[0.99] transition-all inline-flex items-center justify-center gap-3"
                >
                  进入工作台
                  <ArrowRight size={20} />
                </button>
              </div>
            </div>
          </div>

          <div className="mt-16">
            <h2 className="text-2xl font-black text-white text-center">FAQ</h2>
            <div className="mt-6 mx-auto max-w-4xl space-y-3">
              <details className="group rounded-xl border border-white/10 bg-white/[0.03] p-5">
                <summary className="cursor-pointer select-none text-white font-extrabold flex items-center justify-between">
                  <span>是否需要登录才能使用？</span>
                  <span className="text-slate-400 group-open:rotate-180 transition-transform">⌄</span>
                </summary>
                <p className="mt-3 text-sm text-slate-300 leading-relaxed">
                  你可以直接进入工作台开始体验流程；部分能力在未登录状态可能会受限，具体以页面提示为准。
                </p>
              </details>
              <details className="group rounded-xl border border-white/10 bg-white/[0.03] p-5">
                <summary className="cursor-pointer select-none text-white font-extrabold flex items-center justify-between">
                  <span>适合哪些平台的短视频？</span>
                  <span className="text-slate-400 group-open:rotate-180 transition-transform">⌄</span>
                </summary>
                <p className="mt-3 text-sm text-slate-300 leading-relaxed">
                  主要面向 TikTok / Instagram Reels 等海外短视频渠道的内容形态与节奏。
                </p>
              </details>
              <details className="group rounded-xl border border-white/10 bg-white/[0.03] p-5">
                <summary className="cursor-pointer select-none text-white font-extrabold flex items-center justify-between">
                  <span>怎样提升转化率？</span>
                  <span className="text-slate-400 group-open:rotate-180 transition-transform">⌄</span>
                </summary>
                <p className="mt-3 text-sm text-slate-300 leading-relaxed">
                  建议同一商品生成多个版本做 A/B 测试，持续优化开头三秒、卖点顺序与强 CTA。
                </p>
              </details>
            </div>
          </div>
        </section>

        <footer className="absolute bottom-4 inset-x-0 z-10 text-center">
          <a
            href="http://beian.miit.gov.cn"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            粤ICP备2026027661号
          </a>
        </footer>

        {isDebugDialogOpen && (
          <AppDialog
            isOpen={isDebugDialogOpen}
            title="进入调试模式"
            onClose={() => {
              setIsDebugDialogOpen(false);
              setDebugPassword('');
              setDebugError('');
            }}
            footer={
              <>
                <button
                  className="bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-700"
                  onClick={() => {
                    setIsDebugDialogOpen(false);
                    setDebugPassword('');
                    setDebugError('');
                  }}
                >
                  取消
                </button>
                <button
                  className="bg-orange-500 text-black px-4 py-2 rounded-lg text-sm font-bold hover:bg-orange-400 disabled:opacity-60"
                  onClick={() => void handleEnterDebugMode()}
                  disabled={isDebugSubmitting}
                >
                  {isDebugSubmitting ? '验证中...' : '确认进入'}
                </button>
              </>
            }
            widthClassName="max-w-md"
          >
            <div className="space-y-3">
              <div className="text-xs text-zinc-500 leading-relaxed">
                调试模式会开启 agent 页面和 OpenClaw 设置，同时允许打印调试信息。只有知道密码的人才能进入。
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="password"
                  value={debugPassword}
                  onChange={(e) => setDebugPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleEnterDebugMode();
                    }
                  }}
                  placeholder="请输入调试密码"
                  className="w-full rounded-lg border border-white/10 bg-zinc-900/80 pl-10 pr-3 py-2.5 text-sm text-white outline-none focus:border-orange-500/50"
                  autoFocus
                />
              </div>
              {debugError && <div className="text-xs text-red-400">{debugError}</div>}
            </div>
          </AppDialog>
        )}
      </motion.div>
  );
};

export default LandingPage;
