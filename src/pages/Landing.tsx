import React from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Shield, Lock, Sparkles, ShoppingCart, Globe, Clock, TrendingUp, ChevronLeft, ChevronRight, Zap, Brain, Wand2, Video, Image, Layers } from 'lucide-react';
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

  const handleLogin = () => {
    navigate('/login');
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

  const demoSlides = React.useMemo(() => ([
    {
      kind: 'video' as const,
      src: '/intro-page-demo/kling_7b04ff964d.mp4',
      title: '视频生成',
      description: '一键生成脚本，实现可视化编辑',
    },
    {
      kind: 'image' as const,
      src: '/intro-page-demo/anime_ip_after.jpg',
      title: 'AI 智能修复',
      description: '智能修复图片中的服装质量问题。',
    },
    {
      kind: 'image' as const,
      src: '/intro-page-demo/repainted.jpeg',
      title: 'AI 海报编辑',
      description: 'AI + 手动调节商品套图文字位置，实现智能化编辑',
    },
    {
      kind: 'image' as const,
      src: '/intro-page-demo/product_gallery_demo.png',
      title: 'AI 商品套图',
      description: '多图展示，助力商品销售。',
    },
    {
      kind: 'image' as const,
      src: '/intro-page-demo/first_frame_demo.png',
      title: 'AI 首帧图',
      description: 'AI 生成视频首帧，提升视频质量。',
    },
    {
      kind: 'image' as const,
      src: '/intro-page-demo/clothing_demo.png',
      title: 'AI 换装',
      description: 'AI 换装人物，实现个性化编辑。',
    }
  ]), []);

  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [isCarouselHovered, setIsCarouselHovered] = useState(false);

  React.useEffect(() => {
    if (demoSlides.length <= 1) return;
    if (isCarouselHovered) return;
    const intervalId = window.setInterval(() => {
      if (document.hidden) return;
      setActiveSlideIndex((prev) => (prev + 1) % demoSlides.length);
    }, 2000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [demoSlides.length, isCarouselHovered]);

  const normalizeSlideOffset = React.useCallback((idx: number) => {
    const len = demoSlides.length;
    if (len <= 1) return 0;
    let offset = idx - activeSlideIndex;
    if (offset > len / 2) offset -= len;
    if (offset < -len / 2) offset += len;
    return offset;
  }, [activeSlideIndex, demoSlides.length]);

  const goToSlide = React.useCallback((nextIndex: number) => {
    const len = demoSlides.length;
    if (len === 0) return;
    const wrapped = ((nextIndex % len) + len) % len;
    setActiveSlideIndex(wrapped);
  }, [demoSlides.length]);

  const goPrev = React.useCallback(() => {
    goToSlide(activeSlideIndex - 1);
  }, [activeSlideIndex, goToSlide]);

  const goNext = React.useCallback(() => {
    goToSlide(activeSlideIndex + 1);
  }, [activeSlideIndex, goToSlide]);

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
                onClick={handleLogin}
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

          <div className="mt-14">
            <div className="max-w-3xl">
              <h2 className="text-2xl md:text-3xl font-black text-white">案例预览</h2>
            </div>

            <div
              className="relative mt-7"
              onMouseEnter={() => setIsCarouselHovered(true)}
              onMouseLeave={() => setIsCarouselHovered(false)}
            >
              <button
                type="button"
                onClick={goPrev}
                className="absolute left-0 top-1/2 -translate-y-1/2 h-11 w-11 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition inline-flex items-center justify-center"
                aria-label="Previous"
              >
                <ChevronLeft className="w-5 h-5 text-white" />
              </button>

              <button
                type="button"
                onClick={goNext}
                className="absolute right-0 top-1/2 -translate-y-1/2 h-11 w-11 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition inline-flex items-center justify-center"
                aria-label="Next"
              >
                <ChevronRight className="w-5 h-5 text-white" />
              </button>

              <div className="px-14 md:px-16">
                <div className="relative aspect-[16/9]">
                  {demoSlides.map((slide, idx) => {
                    const offset = normalizeSlideOffset(idx);
                    const isActive = offset === 0;
                    const isNearby = Math.abs(offset) <= 1;

                    const x = offset * 240;
                    const scale = isActive ? 1 : 0.92;
                    const opacity = isActive ? 1 : (isNearby ? 0.28 : 0);
                    const blurPx = isActive ? 0 : 1.5;

                    return (
                      <motion.div
                        key={`${slide.kind}-${slide.src}`}
                        initial={false}
                        animate={{
                          x,
                          scale,
                          opacity,
                          filter: `blur(${blurPx}px)`,
                        }}
                        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                        style={{
                          zIndex: isActive ? 30 : (isNearby ? 10 : 0),
                          pointerEvents: isActive ? 'auto' : (isNearby ? 'auto' : 'none'),
                        }}
                        onClick={() => {
                          if (!isActive && isNearby) goToSlide(idx);
                        }}
                        className="absolute inset-0 rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden cursor-pointer"
                      >
                        <div className="w-full h-full flex flex-col">
                          <div className="w-full aspect-[16/9] bg-black/20 overflow-hidden">
                            {slide.kind === 'video' ? (
                              <video
                                src={slide.src}
                                controls={isActive}
                                muted
                                playsInline
                                preload="metadata"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <img
                                src={slide.src}
                                alt={slide.title}
                                loading="lazy"
                                className="w-full h-full object-cover"
                              />
                            )}
                          </div>

                          <div className="hidden md:block p-5">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-white font-extrabold">{slide.title}</div>
                              <div className="text-xs text-zinc-400 tabular-nums">{idx + 1} / {demoSlides.length}</div>
                            </div>
                            <div className="mt-1 text-sm text-slate-300 leading-relaxed">{slide.description}</div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                <div className="mt-4 md:hidden text-center text-xs text-zinc-400 tabular-nums">
                  {activeSlideIndex + 1} / {demoSlides.length}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="relative z-10 max-w-7xl mx-auto px-6 md:px-10 pb-32">
          <div className="max-w-3xl">
            <h2 className="text-2xl md:text-3xl font-black text-white">核心功能</h2>
          </div>
          
          <div className="mt-16 space-y-24">
            <motion.div 
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col md:flex-row items-center gap-10 md:gap-16"
            >
              <div className="flex-1 w-full">
                <div className="aspect-video rounded-3xl bg-gradient-to-br from-violet-600/15 to-blue-500/10 border border-white/10 overflow-hidden flex items-center justify-center">
                  <div className="p-8 text-center">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-tr from-violet-500 to-purple-600 flex items-center justify-center">
                      <Video className="w-10 h-10 text-white" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex-1 w-full">
                <h3 className="text-4xl md:text-5xl font-black bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent mb-4">视频生成</h3>
                <p className="text-white text-2xl font-bold mb-4">一键从图文生成爆款短视频</p>
                <p className="text-slate-300 text-lg leading-relaxed mb-8">
                  支持商品链接上传或图片拖拽，自动生成完整脚本、镜头语言、语音配音与动态画面，一键导出 9:16 竖屏短视频，完美适配 TikTok / Reels 等海外平台。
                </p>
                <motion.button
                  onClick={handleStart}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.97 }}
                  className="relative px-10 py-4 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full text-black font-bold text-lg shadow-[0_0_30px_rgba(34,211,238,0.4)] flex items-center gap-3"
                >
                  免费试用
                  <ArrowRight size={22} />
                </motion.button>
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
              className="flex flex-col md:flex-row-reverse items-center gap-10 md:gap-16"
            >
              <div className="flex-1 w-full">
                <div className="aspect-video rounded-3xl bg-gradient-to-br from-pink-600/15 to-rose-500/10 border border-white/10 overflow-hidden flex items-center justify-center">
                  <div className="p-8 text-center">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-tr from-pink-500 to-rose-600 flex items-center justify-center">
                      <Image className="w-10 h-10 text-white" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex-1 w-full">
                <h3 className="text-4xl md:text-5xl font-black bg-gradient-to-r from-pink-400 to-rose-500 bg-clip-text text-transparent mb-4">AI 智能修图</h3>
                <p className="text-white text-2xl font-bold mb-4">秒级修复商品图片瑕疵</p>
                <p className="text-slate-300 text-lg leading-relaxed mb-8">
                  智能去除图片水印、修正服装褶皱与质量问题，一键生成高清商品主图和白底图，大幅提升电商商品图片品质与转化率。
                </p>
                <motion.button
                  onClick={handleStart}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.97 }}
                  className="relative px-10 py-4 bg-gradient-to-r from-pink-400 to-rose-500 rounded-full text-white font-bold text-lg shadow-[0_0_30px_rgba(236,72,153,0.4)] flex items-center gap-3"
                >
                  免费试用
                  <ArrowRight size={22} />
                </motion.button>
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.4 }}
              className="flex flex-col md:flex-row items-center gap-10 md:gap-16"
            >
              <div className="flex-1 w-full">
                <div className="aspect-video rounded-3xl bg-gradient-to-br from-violet-600/15 to-cyan-500/10 border border-white/10 overflow-hidden flex items-center justify-center">
                  <div className="p-8 text-center">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-tr from-violet-500 to-cyan-600 flex items-center justify-center">
                      <Layers className="w-10 h-10 text-white" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex-1 w-full">
                <h3 className="text-4xl md:text-5xl font-black bg-gradient-to-r from-violet-400 to-cyan-500 bg-clip-text text-transparent mb-4">素材资产库</h3>
                <p className="text-white text-2xl font-bold mb-4">沉淀你的数字资产</p>
                <p className="text-slate-300 text-lg leading-relaxed mb-8">
                  统一管理全局素材，沉淀创作资产，实现素材高效复用与价值循环。支持多格式资源存储、标签分类、快速检索，团队协作更高效。
                </p>
                <motion.button
                  onClick={handleStart}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.97 }}
                  className="relative px-10 py-4 bg-gradient-to-r from-violet-500 to-cyan-500 rounded-full text-white font-bold text-lg shadow-[0_0_30px_rgba(139,92,246,0.4)] flex items-center gap-3"
                >
                  免费试用
                  <ArrowRight size={22} />
                </motion.button>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="relative z-10 max-w-7xl mx-auto px-6 md:px-10 pb-20">
          <div className="max-w-3xl">
            <h2 className="text-2xl md:text-3xl font-black text-white">技术优势</h2>
          </div>
          
          <div className="mt-12 space-y-8">
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="relative group"
            >
              <div className="absolute -inset-1 bg-gradient-to-r from-violet-600/20 to-orange-500/20 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-all duration-700" />
              <div className="relative p-8 rounded-3xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition-all duration-500">
                <div className="flex items-start gap-6">
                  <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-gradient-to-tr from-violet-600 to-purple-500 flex items-center justify-center shadow-2xl shadow-violet-500/30">
                    <Zap size={32} className="text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-black text-white mb-3">极速渲染引擎</h3>
                    <p className="text-slate-300 text-lg leading-relaxed">
                      自研 GPU 加速渲染管线，视频生成速度较行业平均水平提升 300%，从图文到成片仅需数秒，大幅缩短内容生产周期。
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
              className="relative group"
            >
              <div className="absolute -inset-1 bg-gradient-to-r from-pink-600/20 to-violet-500/20 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-all duration-700" />
              <div className="relative p-8 rounded-3xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition-all duration-500">
                <div className="flex items-start gap-6">
                  <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-gradient-to-tr from-pink-600 to-rose-500 flex items-center justify-center shadow-2xl shadow-pink-500/30">
                    <Brain size={32} className="text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-black text-white mb-3">多模态智能理解</h3>
                    <p className="text-slate-300 text-lg leading-relaxed">
                      深度融合视觉、文本、音频多模态大模型，精准解析商品特征与用户意图，自动生成符合海外市场审美的专业级视频脚本与镜头语言。
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.4 }}
              className="relative group"
            >
              <div className="absolute -inset-1 bg-gradient-to-r from-orange-500/20 to-pink-500/20 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-all duration-700" />
              <div className="relative p-8 rounded-3xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition-all duration-500">
                <div className="flex items-start gap-6">
                  <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-gradient-to-tr from-orange-500 to-amber-500 flex items-center justify-center shadow-2xl shadow-orange-500/30">
                    <Wand2 size={32} className="text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-black text-white mb-3">端到端工作流自动化</h3>
                    <p className="text-slate-300 text-lg leading-relaxed">
                      从商品链接/图片输入，到脚本生成、画面渲染、语音配音、字幕添加全链路自动化，零人工干预即可产出高转化率的跨境电商短视频。
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <footer className="relative z-10 border-t border-white/10">
          <div className="max-w-7xl mx-auto px-6 md:px-10 py-10 flex flex-col items-center gap-4">
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-lg">
              <a href="/contact" className="text-white hover:text-violet-400 font-bold transition-colors">联系我们</a>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
              <a href="/doc" className="text-zinc-300 hover:text-white transition-colors">产品文档</a>
              <a href="/privacy-policy" className="text-zinc-300 hover:text-white transition-colors">隐私条款</a>
              <a href="/terms-of-service" className="text-zinc-300 hover:text-white transition-colors">服务协议</a>
            </div>
            <a
              href="http://beian.miit.gov.cn"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              粤ICP备2026027661号
            </a>
          </div>
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
