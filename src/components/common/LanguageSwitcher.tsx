import React from 'react';
import { Globe } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

export const LanguageSwitcher = () => {
  const { language, setLanguage } = useLanguage();

  return (
    <button
      onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}
      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/50 hover:bg-slate-700 border border-white/10 text-xs font-medium text-slate-300 hover:text-white transition-all backdrop-blur-md z-50"
    >
      <Globe size={14} />
      <span>{language === 'en' ? 'English' : '中文'}</span>
    </button>
  );
};