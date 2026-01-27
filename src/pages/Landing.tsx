import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { LanguageSwitcher } from '../components/common/LanguageSwitcher';

const LandingPage = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();

  const handleStart = () => {
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white overflow-hidden relative font-sans selection:bg-violet-500/30">
      
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_100%)] pointer-events-none" />
      
      {/* Glow Effects */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-violet-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />

      {/* --- Navbar --- */}
      <nav className="relative z-50 px-8 py-6 flex items-center justify-between max-w-7xl mx-auto">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-violet-500 to-orange-400 flex items-center justify-center shadow-lg shadow-violet-500/20">
             {/* Simple circle logo from screenshot */}
          </div>
          <span className="text-xl font-bold tracking-tight">VFlow AI</span>
        </div>

        {/* Center Links */}
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400">
          <button className="hover:text-white transition-colors">{t.landing_nav_home}</button>
          <button onClick={handleStart} className="hover:text-white transition-colors">{t.landing_nav_workbench}</button>
          <button className="hover:text-white transition-colors">{t.landing_nav_assets}</button>
          <button className="hover:text-white transition-colors">{t.landing_nav_pricing}</button>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-4">
          <LanguageSwitcher />
          <button 
            onClick={handleStart}
            className="px-5 py-2 rounded-full border border-white/20 hover:bg-white/10 transition-all text-sm font-medium"
          >
            {t.landing_btn_login}
          </button>
        </div>
      </nav>

      {/* --- Hero Section --- */}
      <main className="relative z-10 flex flex-col items-center justify-center min-h-[80vh] text-center px-4">
        
        {/* Main Title "CREATE FLOW" */}
        <h1 className="text-7xl md:text-9xl font-black italic tracking-tighter mb-6 leading-none">
          <span className="text-white">{t.landing_hero_title_1}</span>
          <span className="ml-4 bg-clip-text text-transparent bg-gradient-to-r from-violet-400 via-pink-400 to-orange-400">
            {t.landing_hero_title_2}
          </span>
        </h1>

        {/* Subtitle */}
        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mb-12 font-light">
          {t.landing_subtitle}
        </p>

        {/* CTA Button */}
        <div className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-violet-600 to-orange-500 rounded-lg blur opacity-40 group-hover:opacity-60 transition duration-200" />
          <button 
            onClick={handleStart}
            className="relative px-8 py-4 bg-gradient-to-r from-violet-600 to-pink-500 rounded-lg text-white font-bold text-lg shadow-xl hover:scale-105 transition-transform flex items-center gap-2"
          >
            {t.landing_cta_start}
            <ArrowRight size={20} />
          </button>
        </div>

      </main>
    </div>
  );
};

export default LandingPage;