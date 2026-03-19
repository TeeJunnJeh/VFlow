import React from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Shield, Lock } from 'lucide-react';
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
      navigate('/login');
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
          <motion.div
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
          </motion.div>

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