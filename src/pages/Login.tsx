import React, { useState, useEffect } from 'react';
import { Sparkles, Loader2, ArrowRight, Lock, Smartphone, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../services/auth';
import { useLanguage } from '../context/LanguageContext'; // Keep language support
import { LanguageSwitcher } from '../components/common/LanguageSwitcher'; // Keep switcher

const LoginPage = () => {
  const { login } = useAuth();
  const { t } = useLanguage(); // Get translations

  // Login Method State
  const [method, setMethod] = useState<'email' | 'phone'>('email');

  // Form States
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');

  // UI States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0); // 60s cooldown
  const [error, setError] = useState('');

  // Countdown Logic
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // --- Handlers ---

  // 1. Send OTP Code (Restored Real API Logic)
  const handleSendCode = async () => {
    if (!phone) {
      setError("Please enter a phone number");
      return;
    }
    setError('');
    setIsSendingCode(true);

    try {
      await authApi.sendCode(phone);
      setCountdown(60); // Start 60s cooldown
      alert(`Code sent to ${phone}`); 
    } catch (err: any) {
      setError(err.message || "Failed to send code");
    } finally {
      setIsSendingCode(false);
    }
  };

  // 2. Submit Login (Restored Real API Logic)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      if (method === 'phone') {
        // --- Phone Flow (Real API) ---
        if (!phone || !otp) throw new Error("Please enter phone and code");
        
        // Call your verification API
        const data = await authApi.loginWithPhone(phone, otp);
        
        // Pass the real backend data to context
        await login(phone, data); 

      } else {
        // --- Email Flow (Mock) ---
        if (!email || !password) throw new Error("Please enter email and password");
        await login(email); // Keeps original mock logic for email
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Top Right Language Switcher */}
      <div className="absolute top-6 right-8 z-50">
        <LanguageSwitcher />
      </div>

      {/* Background Blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-violet-600/20 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-indigo-600/20 rounded-full blur-[120px]" />

      <div className="w-full max-w-md p-8 bg-slate-950/50 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl relative z-10">
        
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 mb-4 shadow-lg shadow-violet-500/20">
            <Sparkles className="text-white" size={24} />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">{t.welcome_back}</h1>
          <p className="text-slate-400">{t.sign_in_subtitle}</p>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-1 bg-slate-900/80 rounded-xl mb-6 border border-white/5">
          <button
            onClick={() => { setMethod('email'); setError(''); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${
              method === 'email' 
                ? 'bg-slate-800 text-white shadow-sm ring-1 ring-white/10' 
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Mail size={16} /> {t.tab_email}
          </button>
          <button
            onClick={() => { setMethod('phone'); setError(''); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${
              method === 'phone' 
                ? 'bg-slate-800 text-white shadow-sm ring-1 ring-white/10' 
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Smartphone size={16} /> {t.tab_phone}
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* --- EMAIL FORM --- */}
          {method === 'email' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-300">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">{t.email_label}</label>
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">{t.password_label}</label>
                <div className="relative">
                  <input 
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all"
                    placeholder="••••••••"
                  />
                  <Lock className="absolute right-3 top-3.5 text-slate-600" size={16} />
                </div>
              </div>
            </div>
          )}

          {/* --- PHONE FORM --- */}
          {method === 'phone' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">{t.phone_label}</label>
                <div className="relative flex gap-2">
                  <input 
                    type="text" 
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all"
                    placeholder="+1 234 567 8900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">{t.code_label}</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    className="flex-1 bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all"
                    placeholder="123456"
                    maxLength={6}
                  />
                  <button
                    type="button"
                    onClick={handleSendCode}
                    disabled={isSendingCode || countdown > 0 || !phone}
                    className={`
                      px-4 rounded-xl font-medium text-sm transition-all border border-white/10
                      ${countdown > 0 
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                        : 'bg-slate-800 hover:bg-slate-700 text-white hover:border-white/20'}
                    `}
                  >
                    {isSendingCode ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : countdown > 0 ? (
                      `${countdown}s`
                    ) : (
                      t.btn_get_code
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button 
            type="submit" 
            disabled={isSubmitting}
            className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold py-3.5 rounded-xl transition-all shadow-lg shadow-violet-500/25 flex items-center justify-center gap-2 mt-6 group"
          >
            {isSubmitting ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              <>
                {t.btn_sign_in} <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>

        <p className="text-center text-slate-500 text-sm mt-6">
          {t.no_account} <span className="text-violet-400 cursor-pointer hover:underline">{t.join_waitlist}</span>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;