import React, { useState } from 'react';
import { Plus, ArrowRight, Trash2, Zap, Gem, Flame, Loader2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { templatesApi, type Template } from '../../services/templates';
import { useAuth } from '../../context/AuthContext';
import { LanguageSwitcher } from '../common/LanguageSwitcher';
import { AppDialog } from '../common/AppDialog';

interface TemplatesViewProps {
  templateList: Template[];
  onEditTemplate: (t: Template) => void;
  onCreateTemplate: () => void;
  refreshTemplates: () => void;
}

export const TemplatesView: React.FC<TemplatesViewProps> = ({ 
  templateList, 
  onEditTemplate, 
  onCreateTemplate,
  refreshTemplates 
}) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const categoryLabels: Record<string, string> = {
    camera: t.opt_cat_camera,
    beauty: t.opt_cat_beauty,
    food: t.opt_cat_food,
    electronics: t.opt_cat_digital,
  };
  const styleLabels: Record<string, string> = {
    realistic: t.opt_style_real,
    cinematic: t.opt_style_cine,
    '3d': t.opt_style_3d,
    anime: t.opt_style_anime,
  };
  const displayValue = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return '-';
    const text = String(value).trim();
    return text.length > 0 ? text : '-';
  };
  const displayCategory = (value: string) => displayValue(categoryLabels[value] || value);
  const displayStyle = (value: string) => displayValue(styleLabels[value] || value);
  const displayDuration = (value: number) =>
    Number.isFinite(value) ? `${value}s` : '-';
  const displayShots = (value: number) =>
    Number.isFinite(value) ? value : '-';

  const handleDelete = async (id: string) => {
    if (!user?.id) return;

    setDeletingId(id);
    try {
      await templatesApi.deleteTemplate(user.id, id);
      setDeleteTarget(null);
      refreshTemplates();
    } catch (e) {
      void e;
      // show in-app dialog for error (use existing translation key)
      setInfoTitle(t.tpl_delete_failed || 'Failed to delete template');
      setInfoMessage(t.tpl_delete_failed || 'Failed to delete template');
      setIsInfoOpen(true);
    } finally {
      setDeletingId(prev => (prev === id ? null : prev));
    }
  };

  // Info modal state
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [infoTitle, setInfoTitle] = useState('');
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-full z-10 animate-in fade-in slide-in-from-bottom-4 duration-300">
       <header className="flex justify-between items-center px-10 py-6 border-b border-white/5 shrink-0 bg-black/20 backdrop-blur-sm relative z-50">
          <div><h1 className="text-2xl font-bold tracking-tighter flex items-center gap-3 text-zinc-200">{t.tpl_title}</h1><p className="text-zinc-500 text-xs mt-1">{t.tpl_subtitle}</p></div>
          <div className="flex items-center gap-3"><LanguageSwitcher /><button onClick={onCreateTemplate} className="bg-orange-600 text-white px-5 py-2 rounded-lg font-bold text-sm hover:bg-orange-500 transition flex items-center gap-2 shadow-lg shadow-orange-500/20"><Plus className="w-4 h-4" /> {t.tpl_btn_new}</button></div>
       </header>
       <div className="flex-1 overflow-y-auto p-10 custom-scroll">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
             {templateList.map(tpl => (
                <div key={tpl.id} className={`glass-card rounded-2xl p-6 relative group overflow-hidden border-t-4 flex flex-col justify-between h-96 ${tpl.icon === 'gem' ? 'border-t-orange-500' : 'border-t-purple-500'}`}>
                   <div className={`absolute -right-10 -top-10 w-32 h-32 rounded-full blur-2xl transition group-hover:opacity-40 opacity-20 ${tpl.icon === 'gem' ? 'bg-orange-500' : 'bg-purple-500'}`} />
                   <div className="relative z-10">
                      <div className="flex justify-between items-start mb-6">
                         <div className="w-12 h-12 rounded-xl bg-zinc-800/80 border border-white/5 flex items-center justify-center text-white shadow-lg">{tpl.icon === 'gem' ? <Gem className="w-6 h-6" /> : (tpl.icon === 'zap' ? <Zap className="w-6 h-6"/> : <Flame className="w-6 h-6"/>)}</div>
                         <button onClick={() => setDeleteTarget(tpl)}><Trash2 className="w-4 h-4 text-zinc-600 hover:text-red-500" /></button>
                      </div>
                      <h3 className="text-xl font-bold text-white mb-1">{tpl.name}</h3>
                      <p className="text-xs text-zinc-500 mb-6 font-mono capitalize">{displayCategory(tpl.product_category)} • {displayStyle(tpl.visual_style)}</p>
                      <div className="space-y-2.5 bg-zinc-900/50 p-4 rounded-xl border border-white/5">
                         <div className="flex items-center justify-between text-xs"><span className="text-zinc-500">{t.tpl_meta_category}</span><span className="text-zinc-300 font-bold">{displayCategory(tpl.product_category)}</span></div>
                         <div className="flex items-center justify-between text-xs"><span className="text-zinc-500">{t.tpl_meta_style}</span><span className="text-zinc-300 font-bold">{displayStyle(tpl.visual_style)}</span></div>
                         <div className="flex items-center justify-between text-xs"><span className="text-zinc-500">{t.tpl_meta_ratio}</span><span className="text-zinc-300 font-bold">{displayValue(tpl.aspect_ratio)}</span></div>
                         <div className="flex items-center justify-between text-xs"><span className="text-zinc-500">{t.tpl_meta_duration}</span><span className="text-zinc-300 font-bold">{displayDuration(tpl.duration)}</span></div>
                         <div className="flex items-center justify-between text-xs"><span className="text-zinc-500">{t.tpl_meta_shots}</span><span className="text-zinc-300 font-bold">{displayShots(tpl.shot_number)}</span></div>
                      </div>
                   </div>
                   <button onClick={() => onEditTemplate(tpl)} className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/5 text-xs font-bold text-zinc-300 rounded-xl mt-4 transition flex items-center justify-center gap-2 relative z-10">{t.tpl_btn_edit} <ArrowRight className="w-3 h-3" /></button>
                </div>
             ))}
          </div>
       </div>

       <AppDialog
         isOpen={!!deleteTarget}
         title={t.tpl_delete_confirm_title}
         onClose={() => {
           if (deletingId) return;
           setDeleteTarget(null);
         }}
       footer={
         <>
           <button
             className="bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-700 disabled:opacity-60"
             onClick={() => setDeleteTarget(null)}
             disabled={!!deletingId}
           >
             {t.assets_move_cancel}
           </button>
           <button
             className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-500 disabled:opacity-60 flex items-center gap-2"
             onClick={() => deleteTarget?.id && void handleDelete(deleteTarget.id)}
             disabled={!deleteTarget?.id || !!deletingId}
           >
             {deletingId ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
             {t.assets_delete}
           </button>
         </>
       }
       >
         <div className="whitespace-pre-line">
           <div className="font-medium text-zinc-100">{deleteTarget?.name || '-'}</div>
           <div className="mt-2 text-zinc-400">{t.tpl_delete_confirm_message}</div>
         </div>
       </AppDialog>
      <AppDialog
        isOpen={isInfoOpen}
        title={infoTitle || 'Notice'}
        onClose={() => setIsInfoOpen(false)}
        footer={
          <>
            <button className="bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-700" onClick={() => setIsInfoOpen(false)}>{t.assets_move_cancel}</button>
          </>
        }
      >
        <div className="whitespace-pre-line text-sm text-zinc-300">{infoMessage}</div>
      </AppDialog>
    </div>
  );
};
