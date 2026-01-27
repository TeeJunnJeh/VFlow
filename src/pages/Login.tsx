import React, { useState, useEffect } from 'react';
import { Loader2, X } from 'lucide-react'; 
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
  
  // Phone Form State
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  
  // Email Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // UI State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
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
      alert(`Code sent to ${phone}`);
    } catch (err: any) {
      setError(err.message || "Failed to send code");
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      if (method === 'phone') {
        // --- REAL PHONE LOGIN ---
        if (!phone || !otp) throw new Error("Please enter phone and code");
        const data = await authApi.loginWithPhone(phone, otp);
        await login(phone, data);
      } else {
        // --- ORIGINAL EMAIL LOGIN (MOCK) ---
        if (!email || !password) throw new Error("Please enter email and password");
        await login(email); 
      }
      navigate('/app'); // Redirect after login
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-[#050505] text-white overflow-hidden font-sans">
      
      {/* --- LEFT PANEL (Gradient Branding) --- */}
      {/* Hidden on mobile, Flex on desktop */}
      <div className="hidden lg:flex w-1/2 relative flex-col items-center justify-center overflow-hidden">
        
        {/* Exact Gradient from your screenshot */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#2E1065] via-[#4C1D95] to-[#C2410C] opacity-100 z-0" />
        
        {/* Subtle mesh/noise overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:20px_20px] opacity-20 z-10" />

        {/* Branding Content */}
        <div className="relative z-20 flex flex-col items-center text-center px-12">
          
          {/* Glass Icon Box */}
          <div className="w-32 h-32 mb-8 rounded-[2rem] bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-orange-300 to-purple-500 shadow-lg" />
          </div>

          {/* Brand Name */}
          <h1 className="text-6xl font-black italic tracking-tighter mb-8 text-white drop-shadow-xl">
            VFLOW AI
          </h1>

          {/* Separator Line */}
          <div className="w-24 h-1 bg-white/20 rounded-full mb-8" />

          {/* Tagline (Translated) */}
          <p className="text-sm font-bold tracking-[0.15em] text-white/90 uppercase">
            {t.login_tagline}
          </p>
        </div>
      </div>

      {/* --- RIGHT PANEL (Login Form) --- */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-8 lg:p-16 relative bg-[#000000]">
        
        {/* Top Right Controls */}
        <div className="absolute top-8 right-8 flex items-center gap-6">
          <LanguageSwitcher />
          <button 
            onClick={() => navigate('/')} 
            className="text-gray-500 hover:text-white transition-colors p-2"
          >
            <X size={24} />
          </button>
        </div>

        <div className="w-full max-w-md mt-10 lg:mt-0">
          
          {/* Header */}
          <h2 className="text-4xl font-bold mb-12 text-white">{t.login_title}</h2>

          {/* Tabs */}
          <div className="flex gap-8 mb-10 relative border-b border-white/10">
            {/* Phone Tab */}
            <button
              onClick={() => { setMethod('phone'); setError(''); }}
              className={`pb-3 text-base font-medium transition-all relative ${
                method === 'phone' ? 'text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {t.login_tab_phone}
              {method === 'phone' && (
                <div className="absolute bottom-0 left-0 w-full h-0.5 bg-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.8)]" />
              )}
            </button>

            {/* Email Tab */}
            <button
              onClick={() => { setMethod('email'); setError(''); }}
              className={`pb-3 text-base font-medium transition-all relative ${
                method === 'email' ? 'text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {t.login_tab_email}
              {method === 'email' && (
                <div className="absolute bottom-0 left-0 w-full h-0.5 bg-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.8)]" />
              )}
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs">
              {error}
            </div>
          )}

          {/* FORM AREA */}
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* --- PHONE INPUTS --- */}
            {method === 'phone' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                
                {/* Phone Number */}
                <div className="bg-[#111] rounded-lg border border-[#333] flex items-center p-1 focus-within:border-violet-500/50 transition-colors">
                  <div className="px-4 py-3 text-gray-400 border-r border-[#333] text-sm font-medium">
                    +86
                  </div>
                  <input 
                    type="text" 
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder={t.login_input_phone}
                    className="flex-1 bg-transparent border-none text-white text-sm px-4 py-2 placeholder-gray-600 focus:ring-0 outline-none h-full"
                  />
                </div>

                {/* Verification Code */}
                <div className="bg-[#111] rounded-lg border border-[#333] flex items-center p-1 focus-within:border-violet-500/50 transition-colors">
                  <input 
                    type="text" 
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder={t.login_input_code}
                    className="flex-1 bg-transparent border-none text-white text-sm px-4 py-3 placeholder-gray-600 focus:ring-0 outline-none"
                    maxLength={6}
                  />
                  <button
                    type="button"
                    onClick={handleSendCode}
                    disabled={isSendingCode || countdown > 0 || !phone}
                    className={`
                      mr-1 px-4 py-2 rounded-md text-xs font-medium transition-all h-9 flex items-center
                      ${countdown > 0 
                        ? 'bg-[#222] text-gray-500 cursor-not-allowed' 
                        : 'bg-[#222] text-gray-300 hover:text-white hover:bg-[#333] border border-[#333]'}
                    `}
                  >
                    {isSendingCode ? <Loader2 className="animate-spin" size={14} /> : countdown > 0 ? `${countdown}s` : t.login_btn_get_code}
                  </button>
                </div>
              </div>
            )}

            {/* --- EMAIL INPUTS --- */}
            {method === 'email' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
                <div className="bg-[#111] rounded-lg border border-[#333] p-1 focus-within:border-violet-500/50 transition-colors">
                  <input 
                    type="email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t.login_input_email}
                    className="w-full bg-transparent border-none text-white text-sm px-4 py-3 placeholder-gray-600 focus:ring-0 outline-none"
                  />
                </div>
                <div className="bg-[#111] rounded-lg border border-[#333] p-1 focus-within:border-violet-500/50 transition-colors">
                  <input 
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t.login_input_password}
                    className="w-full bg-transparent border-none text-white text-sm px-4 py-3 placeholder-gray-600 focus:ring-0 outline-none"
                  />
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button 
              type="submit" 
              disabled={isSubmitting}
              className="w-full bg-[#1A1A1A] hover:bg-[#252525] text-white font-medium py-4 rounded-lg transition-all border border-[#333] hover:border-[#555] flex items-center justify-center mt-8 text-sm"
            >
              {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : t.login_btn_start}
            </button>
          </form>

          {/* Footer Terms */}
          <div className="text-center text-gray-600 text-xs mt-10">
            {t.login_agreement} <span className="text-green-500 cursor-pointer hover:underline">{t.login_agreement_user}</span> {t.login_agreement_and} <span className="text-green-500 cursor-pointer hover:underline">{t.login_agreement_privacy}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;