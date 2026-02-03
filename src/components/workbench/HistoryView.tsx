import React from 'react';
import { Video, HardDrive, Eye, Download, Edit3 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { LanguageSwitcher } from '../common/LanguageSwitcher';

export const HistoryView = () => {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col h-full z-10 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <header className="flex justify-between items-center px-10 py-6 border-b border-white/5 shrink-0 bg-black/20 backdrop-blur-sm relative z-50"><div><h1 className="text-2xl font-bold tracking-tighter flex items-center gap-3 text-zinc-200">{t.hist_title}</h1><p className="text-zinc-500 text-xs mt-1">{t.hist_subtitle}</p></div><LanguageSwitcher /></header>
      <div className="flex-1 overflow-y-auto p-10 custom-scroll">
        <div className="max-w-5xl mx-auto space-y-4">
           {/* Placeholder History Item */}
           <div className="glass-card p-4 rounded-xl flex items-center gap-6 group hover:border-orange-500/50 transition">
              <div className="w-40 aspect-video bg-zinc-800 rounded-lg overflow-hidden relative shrink-0 flex items-center justify-center"><Video className="w-6 h-6 text-zinc-700" /></div>
              <div className="flex-1 min-w-0"><h4 className="text-base font-bold text-white truncate group-hover:text-orange-500 transition">Project_Alpha_01</h4><p className="text-xs text-zinc-500 mb-3">2024-05-20 14:30</p></div>
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition px-2"><button className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white"><Download className="w-4 h-4" /></button></div>
           </div>
        </div>
      </div>
    </div>
  );
};