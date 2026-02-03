import React, { useState, useEffect } from 'react';
import { ArrowLeft, Flame, Gem, Zap, ChevronDown } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { type Template, templatesApi } from '../../services/templates';
import { useAuth } from '../../context/AuthContext';
import { LanguageSwitcher } from '../common/LanguageSwitcher';

interface EditorViewProps {
  initialData: Template | null;
  onClose: () => void;
  onSaveSuccess: () => void;
}

export const EditorView: React.FC<EditorViewProps> = ({ initialData, onClose, onSaveSuccess }) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  
  // Constants for validation
  const categoryOptions = ['camera', 'beauty', 'food', 'electronics'] as const;
  const styleOptions = ['realistic', 'cinematic', '3d', 'anime'] as const;
  
  // Custom State
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [customCategory, setCustomCategory] = useState('');
  const [isCustomStyle, setIsCustomStyle] = useState(false);
  const [customStyle, setCustomStyle] = useState('');

  const [editorForm, setEditorForm] = useState<Template>({
    name: 'New Template',
    icon: 'flame',
    product_category: 'camera',
    visual_style: 'realistic',
    aspect_ratio: '16:9',
    duration: 10,
    shot_number: 5,
    custom_config: ''
  });

  // --- MISSING LOGIC RESTORED HERE ---
  useEffect(() => {
    if (initialData) {
      setEditorForm(initialData);

      // Check if Category is custom
      const cat = initialData.product_category || 'camera';
      const isPresetCat = categoryOptions.includes(cat as any);
      setIsCustomCategory(!isPresetCat);
      setCustomCategory(isPresetCat ? '' : cat);

      // Check if Style is custom
      const style = initialData.visual_style || 'realistic';
      const isPresetStyle = styleOptions.includes(style as any);
      setIsCustomStyle(!isPresetStyle);
      setCustomStyle(isPresetStyle ? '' : style);
    } else {
       // Reset for new template
       setIsCustomCategory(false);
       setCustomCategory('');
       setIsCustomStyle(false);
       setCustomStyle('');
       setEditorForm({
        name: 'New Template',
        icon: 'flame',
        product_category: 'camera',
        visual_style: 'realistic',
        aspect_ratio: '16:9',
        duration: 10,
        shot_number: 5,
        custom_config: ''
      });
    }
  }, [initialData]);

  const handleSave = async () => {
    if (!user?.id) return alert("Please log in");
    try {
      if (initialData?.id) {
        await templatesApi.updateTemplate(user.id, initialData.id, editorForm);
      } else {
        await templatesApi.addTemplate(user.id, editorForm);
      }
      onSaveSuccess();
    } catch (err) {
      alert("Failed to save");
    }
  };

  return (
    <div className="flex flex-col h-full z-20 bg-zinc-950 animate-in fade-in zoom-in-95 duration-200">
      <div className="px-10 py-6 border-b border-white/5 flex justify-between items-center gap-4 bg-zinc-900/30 relative z-50">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center hover:bg-zinc-700 transition"><ArrowLeft className="w-5 h-5" /></button>
          <div><h1 className="text-xl font-bold text-white">{initialData ? 'Edit Template' : t.editor_title}</h1><p className="text-xs text-zinc-500">{t.editor_subtitle}</p></div>
        </div>
        <LanguageSwitcher />
      </div>
      <div className="flex-1 overflow-y-auto p-10 max-w-5xl mx-auto w-full custom-scroll">
         <div className="glass-panel p-8 rounded-3xl border border-white/10 space-y-8">
            <div className="grid grid-cols-2 gap-8">
               <div className="space-y-2">
                 <label className="text-sm font-bold text-zinc-400">{t.editor_label_name}</label>
                 <input type="text" value={editorForm.name} onChange={e => setEditorForm({...editorForm, name: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-orange-500 focus:outline-none transition text-white" />
               </div>
               
               <div className="space-y-2">
                 <label className="text-sm font-bold text-zinc-400">{t.editor_label_icon}</label>
                 <div className="flex gap-3">
                    {['flame', 'gem', 'zap'].map(icon => (
                        <button key={icon} onClick={() => setEditorForm({...editorForm, icon})} className={`w-12 h-12 rounded-xl border flex items-center justify-center transition ${editorForm.icon === icon ? 'bg-orange-500/20 border-orange-500 text-orange-500' : 'bg-zinc-800 border-white/5 text-zinc-500 hover:text-white'}`}>
                            {icon === 'flame' && <Flame className="w-6 h-6" />}
                            {icon === 'gem' && <Gem className="w-6 h-6" />}
                            {icon === 'zap' && <Zap className="w-6 h-6" />}
                        </button>
                    ))}
                 </div>
               </div>
            </div>
            
            <hr className="border-white/5" />

            <div className="grid grid-cols-2 gap-8">
                {/* Category Selection */}
                <div className="space-y-2">
                    <label className="text-sm font-bold text-zinc-400">{t.editor_label_category}</label>
                    <div className="relative">
                        <select 
                            value={isCustomCategory ? '__custom__' : editorForm.product_category} 
                            onChange={e => { 
                                const value = e.target.value; 
                                if (value === '__custom__') { 
                                    setIsCustomCategory(true); 
                                    setEditorForm({ ...editorForm, product_category: customCategory }); 
                                } else { 
                                    setIsCustomCategory(false); 
                                    setCustomCategory(''); 
                                    setEditorForm({ ...editorForm, product_category: value }); 
                                } 
                            }} 
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-orange-500 focus:outline-none transition text-white appearance-none cursor-pointer"
                        >
                            <option value="camera">{t.opt_cat_camera}</option>
                            <option value="beauty">{t.opt_cat_beauty}</option>
                            <option value="food">{t.opt_cat_food}</option>
                            <option value="electronics">{t.opt_cat_digital}</option>
                            <option value="__custom__">{t.opt_cat_custom}</option>
                        </select>
                        <ChevronDown className="absolute right-4 top-3.5 w-4 h-4 text-zinc-500 pointer-events-none" />
                    </div>
                    {isCustomCategory && (
                        <input 
                            type="text" 
                            value={customCategory} 
                            onChange={e => { 
                                const value = e.target.value; 
                                setCustomCategory(value); 
                                setEditorForm({ ...editorForm, product_category: value }); 
                            }} 
                            placeholder={t.editor_ph_select} 
                            className="mt-3 w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-orange-500 focus:outline-none transition text-white" 
                        />
                    )}
                </div>

                {/* Style Selection */}
                <div className="space-y-2">
                    <label className="text-sm font-bold text-zinc-400">{t.editor_label_style}</label>
                    <div className="relative">
                        <select 
                            value={isCustomStyle ? '__custom__' : editorForm.visual_style} 
                            onChange={e => { 
                                const value = e.target.value; 
                                if (value === '__custom__') { 
                                    setIsCustomStyle(true); 
                                    setEditorForm({ ...editorForm, visual_style: customStyle }); 
                                } else { 
                                    setIsCustomStyle(false); 
                                    setCustomStyle(''); 
                                    setEditorForm({ ...editorForm, visual_style: value }); 
                                } 
                            }} 
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-orange-500 focus:outline-none transition text-white appearance-none cursor-pointer"
                        >
                            <option value="realistic">{t.opt_style_real}</option>
                            <option value="cinematic">{t.opt_style_cine}</option>
                            <option value="3d">{t.opt_style_3d}</option>
                            <option value="anime">{t.opt_style_anime}</option>
                            <option value="__custom__">{t.opt_style_custom}</option>
                        </select>
                        <ChevronDown className="absolute right-4 top-3.5 w-4 h-4 text-zinc-500 pointer-events-none" />
                    </div>
                    {isCustomStyle && (
                        <input 
                            type="text" 
                            value={customStyle} 
                            onChange={e => { 
                                const value = e.target.value; 
                                setCustomStyle(value); 
                                setEditorForm({ ...editorForm, visual_style: value }); 
                            }} 
                            placeholder={t.editor_ph_select} 
                            className="mt-3 w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-orange-500 focus:outline-none transition text-white" 
                        />
                    )}
                </div>
            </div>

            <div className="grid grid-cols-3 gap-6">
               <div className="space-y-2">
                   <label className="text-sm font-bold text-zinc-400">{t.editor_label_ratio}</label>
                   <div className="relative">
                       <select value={editorForm.aspect_ratio} onChange={e => setEditorForm({...editorForm, aspect_ratio: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-orange-500 focus:outline-none transition text-white appearance-none cursor-pointer">
                           <option value="16:9">16:9 (1280x720)</option>
                           <option value="9:16">9:16 (720x1280)</option>
                           <option value="1:1">1:1 (1080x1080)</option>
                       </select>
                       <ChevronDown className="absolute right-4 top-3.5 w-4 h-4 text-zinc-500 pointer-events-none" />
                   </div>
               </div>
               <div className="space-y-2"><label className="text-sm font-bold text-zinc-400">{t.editor_label_duration}</label><input type="number" value={editorForm.duration} onChange={e => setEditorForm({...editorForm, duration: parseInt(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-orange-500 focus:outline-none transition text-white" /></div>
               <div className="space-y-2"><label className="text-sm font-bold text-zinc-400">{t.editor_label_shots}</label><input type="number" value={editorForm.shot_number} onChange={e => setEditorForm({...editorForm, shot_number: parseInt(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-orange-500 focus:outline-none transition text-white" /></div>
            </div>

            <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-400">{t.editor_label_custom}</label>
                <textarea value={editorForm.custom_config} onChange={e => setEditorForm({...editorForm, custom_config: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-orange-500 focus:outline-none transition text-white resize-none h-24" placeholder={t.editor_ph_custom}></textarea>
            </div>
            
            <hr className="border-white/5" />
            
            <div className="pt-2 flex justify-end gap-4">
               <button onClick={onClose} className="px-6 py-3 rounded-xl text-sm font-bold text-zinc-400 hover:text-white hover:bg-white/5 transition">{t.editor_btn_cancel}</button>
               <button onClick={handleSave} className="px-8 py-3 rounded-xl text-sm font-bold bg-orange-600 text-white hover:bg-orange-500 shadow-lg shadow-orange-500/20 transition">{t.editor_btn_save}</button>
            </div>
         </div>
      </div>
    </div>
  );
};