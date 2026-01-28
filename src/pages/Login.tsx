import React, { useState, useEffect } from 'react';
import { Loader2, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../services/auth';
import { useLanguage } from '../context/LanguageContext';
import { LanguageSwitcher } from '../components/common/LanguageSwitcher';

const LoginPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { t } = useLanguage();

  // --- 业务状态 ---
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');

  // --- UI 交互状态 ---
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isLoginSuccess, setIsLoginSuccess] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');

  // --- 验证码倒计时逻辑 ---
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // --- 发送验证码处理 ---
  const handleSendCode = async () => {
    if (phone.length !== 11) {
      setError(t.login_error_invalid_phone);
      return;
    }
    setError('');
    setIsSendingCode(true);
    try {
      await authApi.sendCode(phone);
      setCountdown(60);
    } catch (err: any) {
      setError(err.message || "Failed to send code");
    } finally {
      setIsSendingCode(false);
    }
  };

  // --- 登录提交处理 ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoginSuccess) return;
    setError('');

    try {
      if (!phone || !otp) throw new Error(t.login_error_missing_fields);
      if (phone.length !== 11) throw new Error(t.login_error_invalid_phone);
      if (otp !== '1234' && otp !== '8888') throw new Error(t.login_error_invalid_otp);

      setIsSubmitting(true);
      const data = await authApi.loginWithPhone(phone, otp);
      await login(phone, data);

      setIsLoginSuccess(true);
      setTimeout(() => {
        navigate('/app');
      }, 1200);

    } catch (err: any) {
      setError(err.message || "Login failed");
      setIsSubmitting(false);
    }
  };

  return (
      <div className="min-h-screen w-full flex bg-[#050505] text-white overflow-hidden font-sans relative">

        {/* --- 全屏登录成功动画层 --- */}
        <AnimatePresence>
          {isLoginSuccess && (
              <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute inset-0 z-[100] flex items-center justify-center pointer-events-none"
              >
                <div className="absolute inset-0 bg-white/5 animate-pulse duration-700" />
                <div className="w-20 h-20 rounded-full bg-violet-500/50 shadow-[0_0_100px_50px_rgba(139,92,246,0.6)] animate-ping-slow" />
                <div className="absolute w-40 h-40 rounded-full border-2 border-orange-500/30 animate-ripple" />
                <div className="relative z-[101]">
                  <CheckCircle2 className="w-24 h-24 text-white drop-shadow-[0_0_20px_rgba(139,92,246,0.8)]" />
                </div>
              </motion.div>
          )}
        </AnimatePresence>

        {/* --- 左侧面板：品牌展示 --- */}
        <div className={`hidden lg:flex w-1/2 relative flex-col items-center justify-center overflow-hidden transition-all duration-1000 ${isLoginSuccess ? 'scale-110 blur-xl opacity-50' : ''}`}>
          <div className="absolute inset-0 bg-gradient-to-b from-[#1e0a45] via-[#311463] to-[#7c2d12] opacity-100" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:20px_20px] opacity-20" />

          <div className="relative z-20 flex flex-col items-center text-center px-12">
            {/* 呼吸图标 */}
            <div className="w-32 h-32 mb-8 rounded-[2.5rem] bg-white/10 backdrop-blur-2xl border border-white/20 flex items-center justify-center shadow-[0_0_50px_rgba(139,92,246,0.3)]">
              <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-orange-400 to-violet-500 animate-pulse" />
            </div>

            {/* 动态流光标题 - 修复显示不全问题 */}
            <div className="relative group mb-8 overflow-visible">
              <motion.h1
                  animate={{
                    backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
                    y: [0, -5, 0]
                  }}
                  transition={{
                    backgroundPosition: { duration: 5, repeat: Infinity, ease: "linear" },
                    y: { duration: 4, repeat: Infinity, ease: "easeInOut" }
                  }}
                  style={{ backgroundSize: "200% auto" }}
                  className="text-7xl md:text-8xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white via-violet-400 via-orange-400 to-white leading-[1.1] drop-shadow-[0_10px_15px_rgba(0,0,0,0.5)] px-10 py-4 whitespace-nowrap"
              >
                VFLOW AI
              </motion.h1>
              <motion.div
                  animate={{ opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 3, repeat: Infinity }}
                  className="absolute -inset-x-10 -bottom-2 h-px bg-gradient-to-r from-transparent via-violet-500 to-transparent blur-sm"
              />
            </div>

            {/* 副标题：支持英文双行排版 */}
            <p
                className="text-sm font-bold tracking-[0.4em] text-white/80 uppercase leading-relaxed max-w-[320px] text-center"
                dangerouslySetInnerHTML={{ __html: t.login_tagline }}
            />
          </div>
        </div>

        {/* --- 右侧面板：表单操作 --- */}
        <div className={`w-full lg:w-1/2 flex flex-col justify-center items-center p-8 lg:p-16 relative bg-[#000000] transition-transform duration-1000 ${isLoginSuccess ? 'scale-90 opacity-0' : ''}`}>
          <div className="absolute top-8 right-8 flex items-center gap-6 z-50">
            <LanguageSwitcher />
            <button onClick={() => navigate('/')} className="text-gray-500 hover:text-white transition-all hover:rotate-90">
              <X size={24} />
            </button>
          </div>

          <div className="w-full max-w-md mt-10 lg:mt-0">
            <h2 className="text-4xl font-bold mb-10 text-white tracking-tight">{t.login_title}</h2>

            <AnimatePresence mode="wait">
              {error && (
                  <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-500 text-sm font-bold"
                  >
                    <AlertCircle size={18} />
                    {error}
                  </motion.div>
              )}
            </AnimatePresence>

            <div className="mb-10 relative border-b border-white/10">
              <div className="pb-4 text-base font-bold text-white uppercase tracking-wider">
                {t.login_tab_phone}
                <div className="absolute bottom-0 left-0 w-24 h-0.5 bg-violet-500 shadow-[0_0_15px_rgba(139,92,246,1)]" />
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-6">
                <div className="bg-[#0a0a0a] rounded-xl border border-white/10 flex items-center p-1 focus-within:border-violet-500/60 transition-all duration-300">
                  <div className="px-5 py-3 text-gray-400 border-r border-white/10 text-sm font-bold">+86</div>
                  <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder={t.login_input_phone}
                      className="flex-1 bg-transparent text-white text-sm px-4 py-3 outline-none"
                  />
                </div>
                <div className="bg-[#0a0a0a] rounded-xl border border-white/10 flex items-center p-1 focus-within:border-violet-500/60 transition-all duration-300">
                  <input
                      type="text"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      placeholder={t.login_input_code}
                      className="flex-1 bg-transparent text-white text-sm px-4 py-3 outline-none tracking-[0.2em]"
                      maxLength={6}
                  />
                  <button
                      type="button"
                      onClick={handleSendCode}
                      disabled={isSendingCode || countdown > 0 || phone.length !== 11}
                      className="mr-1 px-5 py-2 rounded-lg text-xs font-bold transition-all bg-white/5 text-gray-300 disabled:opacity-20 border border-white/5"
                  >
                    {isSendingCode ? <Loader2 className="animate-spin" size={14} /> : countdown > 0 ? `${countdown}s` : t.login_btn_get_code}
                  </button>
                </div>
              </div>

              <button
                  type="submit"
                  disabled={isSubmitting || isLoginSuccess}
                  className="w-full bg-[#111] hover:bg-violet-600/10 text-white font-black py-4 rounded-xl transition-all duration-500 border border-white/10 hover:border-violet-500 flex items-center justify-center mt-10 text-sm tracking-widest hover:shadow-[0_0_30px_rgba(139,92,246,0.2)]"
              >
                {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : t.login_btn_start}
              </button>
            </form>
          </div>
        </div>
      </div>
  );
};

export default LoginPage;