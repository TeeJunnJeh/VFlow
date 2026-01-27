import React, { useState, useEffect } from 'react';
import { Loader2, X, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../services/auth';
import { useLanguage } from '../context/LanguageContext';
import { LanguageSwitcher } from '../components/common/LanguageSwitcher';

const LoginPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { t } = useLanguage();

  // --- State ---
  const [method, setMethod] = useState<'phone' | 'email'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // UI 交互状态
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isLoginSuccess, setIsLoginSuccess] = useState(false); // 控制光波动画
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');

  // --- Logic ---
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleSendCode = async () => {
    if (!phone) {
      setError("Please enter a phone number");
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoginSuccess) return;
    setError('');
    setIsSubmitting(true);

    try {
      if (method === 'phone') {
        if (!phone || !otp) throw new Error("Please enter phone and code");
        const data = await authApi.loginWithPhone(phone, otp);
        await login(phone, data);
      } else {
        if (!email || !password) throw new Error("Please enter email and password");
        await login(email);
      }

      // --- 触发登录成功动画 ---
      setIsLoginSuccess(true);

      // 等待动画播放完毕后再跳转 (约 1.2 秒)
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

        {/* --- 全屏光波动画层 --- */}
        {isLoginSuccess && (
            <div className="absolute inset-0 z-[100] flex items-center justify-center pointer-events-none">
              {/* 背景变白闪烁 */}
              <div className="absolute inset-0 bg-white/5 animate-pulse duration-700" />
              {/* 核心扩散波 - 第一层 */}
              <div className="w-20 h-20 rounded-full bg-violet-500/50 shadow-[0_0_100px_50px_rgba(139,92,246,0.6)] animate-ping-slow" />
              {/* 核心扩散波 - 第二层 */}
              <div className="absolute w-40 h-40 rounded-full border-2 border-orange-500/30 animate-ripple" />
              {/* 中心成功图标 */}
              <div className="relative z-[101] animate-in zoom-in fade-in duration-500">
                <CheckCircle2 className="w-24 h-24 text-white drop-shadow-[0_0_20px_rgba(139,92,246,0.8)]" />
              </div>
            </div>
        )}

        {/* --- 左侧面板 --- */}
        <div className={`hidden lg:flex w-1/2 relative flex-col items-center justify-center overflow-hidden transition-all duration-1000 ${isLoginSuccess ? 'scale-110 blur-xl opacity-50' : ''}`}>
          <div className="absolute inset-0 bg-gradient-to-b from-[#1e0a45] via-[#311463] to-[#7c2d12] opacity-100" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:20px_20px] opacity-20" />

          <div className="relative z-20 flex flex-col items-center text-center px-12">
            <div className="w-32 h-32 mb-8 rounded-[2.5rem] bg-white/10 backdrop-blur-2xl border border-white/20 flex items-center justify-center shadow-[0_0_50px_rgba(139,92,246,0.3)]">
              <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-orange-400 to-violet-500 animate-pulse" />
            </div>
            <h1 className="text-6xl font-black italic tracking-tighter mb-8 text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]">VFLOW AI</h1>
            <p className="text-sm font-bold tracking-[0.4em] text-white/80 uppercase">{t.login_tagline}</p>
          </div>
        </div>

        {/* --- 右侧面板 --- */}
        <div className={`w-full lg:w-1/2 flex flex-col justify-center items-center p-8 lg:p-16 relative bg-[#000000] transition-transform duration-1000 ${isLoginSuccess ? 'scale-90 opacity-0' : ''}`}>

          <div className="absolute top-8 right-8 flex items-center gap-6 z-50">
            <LanguageSwitcher />
            <button onClick={() => navigate('/')} className="text-gray-500 hover:text-white transition-all hover:rotate-90">
              <X size={24} />
            </button>
          </div>

          <div className="w-full max-w-md mt-10 lg:mt-0">
            <h2 className="text-4xl font-bold mb-12 text-white tracking-tight">{t.login_title}</h2>

            <div className="flex gap-10 mb-10 relative border-b border-white/10">
              {['phone', 'email'].map((m) => (
                  <button
                      key={m}
                      onClick={() => { setMethod(m as any); setError(''); }}
                      className={`pb-4 text-base font-bold transition-all duration-300 relative uppercase tracking-wider ${
                          method === m ? 'text-white' : 'text-gray-500 hover:text-gray-300'
                      }`}
                  >
                    {m === 'phone' ? t.login_tab_phone : t.login_tab_email}
                    {method === m && (
                        <div className="absolute bottom-0 left-0 w-full h-0.5 bg-violet-500 shadow-[0_0_15px_rgba(139,92,246,1)] animate-in zoom-in-x duration-300" />
                    )}
                  </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {method === 'phone' ? (
                  <div className="space-y-6">
                    <div className="bg-[#0a0a0a] rounded-xl border border-white/10 flex items-center p-1 focus-within:border-violet-500/60 transition-all duration-300">
                      <div className="px-5 py-3 text-gray-400 border-r border-white/10 text-sm font-bold">+86</div>
                      <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t.login_input_phone} className="flex-1 bg-transparent text-white text-sm px-4 py-3 outline-none" />
                    </div>
                    <div className="bg-[#0a0a0a] rounded-xl border border-white/10 flex items-center p-1 focus-within:border-violet-500/60 transition-all duration-300">
                      <input type="text" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder={t.login_input_code} className="flex-1 bg-transparent text-white text-sm px-4 py-3 outline-none tracking-[0.2em]" maxLength={6} />
                      <button type="button" onClick={handleSendCode} disabled={isSendingCode || countdown > 0 || !phone} className="mr-1 px-5 py-2 rounded-lg text-xs font-bold transition-all bg-white/5 text-gray-300 hover:bg-white/10 border border-white/5">
                        {isSendingCode ? <Loader2 className="animate-spin" size={14} /> : countdown > 0 ? `${countdown}s` : t.login_btn_get_code}
                      </button>
                    </div>
                  </div>
              ) : (
                  <div className="space-y-6">
                    <div className="bg-[#0a0a0a] rounded-xl border border-white/10 p-1 focus-within:border-violet-500/60 transition-all duration-300">
                      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.login_input_email} className="w-full bg-transparent text-white text-sm px-5 py-3 outline-none" />
                    </div>
                    <div className="bg-[#0a0a0a] rounded-xl border border-white/10 p-1 focus-within:border-violet-500/60 transition-all duration-300">
                      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t.login_input_password} className="w-full bg-transparent text-white text-sm px-5 py-3 outline-none" />
                    </div>
                  </div>
              )}

              <button type="submit" disabled={isSubmitting || isLoginSuccess} className="w-full bg-[#111] hover:bg-violet-600/10 text-white font-black py-4 rounded-xl transition-all duration-500 border border-white/10 hover:border-violet-500 flex items-center justify-center mt-10 text-sm tracking-widest hover:shadow-[0_0_30px_rgba(139,92,246,0.2)]">
                {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : t.login_btn_start}
              </button>
            </form>
          </div>
        </div>
      </div>
  );
};

export default LoginPage;