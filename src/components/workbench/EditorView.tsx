import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Flame, Gem, Zap, ChevronDown, Camera, Sparkles, Utensils, Cpu, Eye, Film, Box, Wand2, PencilLine, UserSquare2, Maximize2, X, Loader2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { AppDialog } from '../common/AppDialog';
import { type Template, templatesApi } from '../../services/templates';
import { assetsApi, type Asset as LibraryAsset } from '../../services/assets';
import { useAuth } from '../../context/AuthContext';
import { LanguageSwitcher } from '../common/LanguageSwitcher';

const toDisplayUrl = (pathOrUrl: string | null | undefined): string => {
  if (!pathOrUrl) return '';
  const raw = String(pathOrUrl).trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
  const normalized = raw.startsWith('/') ? raw : `/${raw}`;
  const mediaBase: string = (import.meta as any).env?.VITE_MEDIA_BASE_URL || '';
  if (mediaBase && normalized.startsWith('/media/')) return `${mediaBase}${normalized}`;
  return normalized;
};

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
  const categoryChoices = [
    { value: 'camera', label: t.opt_cat_camera, Icon: Camera },
    { value: 'beauty', label: t.opt_cat_beauty, Icon: Sparkles },
    { value: 'food', label: t.opt_cat_food, Icon: Utensils },
    { value: 'electronics', label: t.opt_cat_digital, Icon: Cpu },
    { value: '__custom__', label: t.opt_cat_custom, Icon: PencilLine },
  ];
  const styleChoices = [
    { value: 'realistic', label: t.opt_style_real, Icon: Eye },
    { value: 'cinematic', label: t.opt_style_cine, Icon: Film },
    { value: '3d', label: t.opt_style_3d, Icon: Box },
    { value: 'anime', label: t.opt_style_anime, Icon: Wand2 },
    { value: '__custom__', label: t.opt_style_custom, Icon: PencilLine },
  ];

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

  // --- Model Asset State (upload-based) ---
  const [selectedModelId, setSelectedModelId] = useState<number | null | undefined>(undefined); // undefined = not yet initialised
  const [uploadedModelPreview, setUploadedModelPreview] = useState<{ url: string; name: string } | null>(null);
  const [isUploadingModel, setIsUploadingModel] = useState(false);
  const [showFullPreview, setShowFullPreview] = useState(false);
  const modelFileInputRef = useRef<HTMLInputElement>(null);

  const [selectedMotionId, setSelectedMotionId] = useState<number | null | undefined>(undefined);
  const [uploadedMotionPreview, setUploadedMotionPreview] = useState<{ url: string; name: string } | null>(null);
  const [isUploadingMotion, setIsUploadingMotion] = useState(false);
  const motionFileInputRef = useRef<HTMLInputElement>(null);
  const [assetPickerMode, setAssetPickerMode] = useState<'model' | 'motion' | null>(null);
  const [assetPickerLoading, setAssetPickerLoading] = useState(false);
  const [assetPickerError, setAssetPickerError] = useState<string | null>(null);
  const [assetPickerItems, setAssetPickerItems] = useState<LibraryAsset[]>([]);
  // Info dialog state to replace native alert()
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [infoTitle, setInfoTitle] = useState('');
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const openInfo = (title: string, message: string | null = null) => {
    setInfoTitle(title || '');
    setInfoMessage(message || null);
    setIsInfoOpen(true);
  };

  const handleModelImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // reset so same file can be re-selected
    setIsUploadingModel(true);
    try {
      const resp = await assetsApi.uploadAsset(file, 'model');
      const data: any = (resp as any)?.data || (Array.isArray((resp as any)?.assets) ? (resp as any).assets[0] : null) || resp;
      const rawUrl: string = data?.url || data?.file_url || data?.path || '';
      const fullUrl = toDisplayUrl(rawUrl);
      const idNum = data?.id !== undefined && data?.id !== null ? Number(data.id) : null;
      setSelectedModelId(Number.isFinite(idNum as any) ? (idNum as number) : null);
      setUploadedModelPreview({ url: fullUrl, name: data?.display_name || data?.name || file.name });
    } catch {
      openInfo('Error', 'Failed to upload model image');
    } finally {
      setIsUploadingModel(false);
    }
  };

  const handleMotionVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setIsUploadingMotion(true);
    try {
      const resp = await assetsApi.uploadAsset(file, 'motion');
      const data: any = (resp as any)?.data || (Array.isArray((resp as any)?.assets) ? (resp as any).assets[0] : null) || resp;
      const rawUrl: string = data?.url || data?.file_url || data?.path || '';
      const fullUrl = toDisplayUrl(rawUrl);
      const idNum = data?.id !== undefined && data?.id !== null ? Number(data.id) : null;
      setSelectedMotionId(Number.isFinite(idNum as any) ? (idNum as number) : null);
      setUploadedMotionPreview({ url: fullUrl, name: data?.display_name || data?.name || file.name });
    } catch {
      openInfo('Error', 'Failed to upload motion video');
    } finally {
      setIsUploadingMotion(false);
    }
  };

  // --- MISSING LOGIC RESTORED HERE ---
  useEffect(() => {
    if (initialData) {
      setEditorForm(initialData);
      // Initialise model selection from existing template data
      setSelectedModelId(initialData.default_model_asset?.id ?? initialData.default_model_asset_id ?? null);
      if (initialData.default_model_asset) {
        const asset: any = initialData.default_model_asset;
        const rawUrl: string = asset?.url || asset?.file_url || asset?.path || '';
        const fullUrl = toDisplayUrl(rawUrl);
        const name = asset?.display_name || asset?.name || asset?.file_name || 'model';
        setUploadedModelPreview({ url: fullUrl, name });
      } else {
        setUploadedModelPreview(null);
      }

      setSelectedMotionId(initialData.default_motion_asset?.id ?? initialData.default_motion_asset_id ?? null);
      if (initialData.default_motion_asset) {
        const asset: any = initialData.default_motion_asset;
        const rawUrl: string = asset?.url || asset?.file_url || asset?.path || '';
        const fullUrl = toDisplayUrl(rawUrl);
        const name = asset?.display_name || asset?.name || asset?.file_name || 'motion';
        setUploadedMotionPreview({ url: fullUrl, name });
      } else {
        setUploadedMotionPreview(null);
      }

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
      setSelectedModelId(null);
      setSelectedMotionId(null);
       setUploadedModelPreview(null);
       setUploadedMotionPreview(null);
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

  useEffect(() => {
    if (!assetPickerMode) return;
    let cancelled = false;

    const loadPickerItems = async () => {
      setAssetPickerLoading(true);
      setAssetPickerError(null);
      try {
        const nextType = assetPickerMode === 'model' ? 'model' : 'motion';
        const items = await assetsApi.getAssets({ type: nextType, folderId: null });
        if (!cancelled) {
          const normalized = Array.isArray(items) ? items : [];
          setAssetPickerItems(
            normalized.filter((item) => (assetPickerMode === 'model' ? item.media_kind !== 'video' : item.media_kind === 'video'))
          );
        }
      } catch (err: any) {
        if (!cancelled) {
          setAssetPickerItems([]);
          setAssetPickerError(String(err?.message || '加载素材失败'));
        }
      } finally {
        if (!cancelled) setAssetPickerLoading(false);
      }
    };

    void loadPickerItems();
    return () => {
      cancelled = true;
    };
  }, [assetPickerMode]);

  const openAssetPicker = (mode: 'model' | 'motion') => {
    setAssetPickerMode(mode);
  };

  const closeAssetPicker = () => {
    setAssetPickerMode(null);
    setAssetPickerItems([]);
    setAssetPickerError(null);
    setAssetPickerLoading(false);
  };

  const chooseAssetFromLibrary = (asset: LibraryAsset) => {
    if (assetPickerMode === 'model') {
      setSelectedModelId(Number(asset.id));
      setUploadedModelPreview({
        url: toDisplayUrl(asset.file_url),
        name: asset.name || 'model',
      });
    } else if (assetPickerMode === 'motion') {
      setSelectedMotionId(Number(asset.id));
      setUploadedMotionPreview({
        url: toDisplayUrl(asset.file_url),
        name: asset.name || 'motion',
      });
    }
    closeAssetPicker();
  };

  const handleSave = async () => {
    if (!user?.id) { openInfo('Notice', 'Please log in'); return; }
    try {
      // Attach model asset id (null = smart match, undefined = not changed)
      const payload: Template = {
        ...editorForm,
        ...(selectedModelId !== undefined
          ? { default_model_asset_id: selectedModelId ?? null }
          : {}),
        ...(selectedMotionId !== undefined
          ? { default_motion_asset_id: selectedMotionId ?? null }
          : {}),
      };
      if (initialData?.id) {
        await templatesApi.updateTemplate(user.id, initialData.id, payload);
      } else {
        await templatesApi.addTemplate(user.id, payload);
      }
      onSaveSuccess();
    } catch (err) {
      openInfo('Error', 'Failed to save');
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
      {isInfoOpen && (
        <AppDialog isOpen={isInfoOpen} title={infoTitle || 'Notice'} onClose={() => setIsInfoOpen(false)} footer={<><button className="bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-700" onClick={() => setIsInfoOpen(false)}>OK</button></>}>
          <div className="whitespace-pre-line text-sm text-zinc-300">{infoMessage}</div>
        </AppDialog>
      )}
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
                    <div className="grid grid-cols-2 gap-3">
                        {categoryChoices.map(({ value, label, Icon }) => {
                          const selected = isCustomCategory ? value === '__custom__' : editorForm.product_category === value;
                          return (
                            <button
                              key={value}
                              type="button"
                              onClick={() => {
                                if (value === '__custom__') {
                                  setIsCustomCategory(true);
                                  setEditorForm({ ...editorForm, product_category: customCategory });
                                } else {
                                  setIsCustomCategory(false);
                                  setCustomCategory('');
                                  setEditorForm({ ...editorForm, product_category: value });
                                }
                              }}
                              className={`group flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm transition ${
                                selected
                                  ? 'border-orange-500/70 bg-orange-500/10 text-orange-200 shadow-[0_0_0_1px_rgba(249,115,22,0.2)]'
                                  : 'border-white/10 bg-black/30 text-zinc-300 hover:border-white/30 hover:bg-white/5'
                              }`}
                            >
                              <span className={`flex h-8 w-8 items-center justify-center rounded-lg border text-xs ${
                                selected ? 'border-orange-500/50 bg-orange-500/15 text-orange-200' : 'border-white/10 bg-zinc-900/60 text-zinc-400'
                              }`}>
                                <Icon className="h-4 w-4" />
                              </span>
                              <span className="font-semibold">{label}</span>
                            </button>
                          );
                        })}
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
                    <div className="grid grid-cols-2 gap-3">
                        {styleChoices.map(({ value, label, Icon }) => {
                          const selected = isCustomStyle ? value === '__custom__' : editorForm.visual_style === value;
                          return (
                            <button
                              key={value}
                              type="button"
                              onClick={() => {
                                if (value === '__custom__') {
                                  setIsCustomStyle(true);
                                  setEditorForm({ ...editorForm, visual_style: customStyle });
                                } else {
                                  setIsCustomStyle(false);
                                  setCustomStyle('');
                                  setEditorForm({ ...editorForm, visual_style: value });
                                }
                              }}
                              className={`group flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm transition ${
                                selected
                                  ? 'border-orange-500/70 bg-orange-500/10 text-orange-200 shadow-[0_0_0_1px_rgba(249,115,22,0.2)]'
                                  : 'border-white/10 bg-black/30 text-zinc-300 hover:border-white/30 hover:bg-white/5'
                              }`}
                            >
                              <span className={`flex h-8 w-8 items-center justify-center rounded-lg border text-xs ${
                                selected ? 'border-orange-500/50 bg-orange-500/15 text-orange-200' : 'border-white/10 bg-zinc-900/60 text-zinc-400'
                              }`}>
                                <Icon className="h-4 w-4" />
                              </span>
                              <span className="font-semibold">{label}</span>
                            </button>
                          );
                        })}
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

            {/* Default Model Asset Picker – Upload */}
            <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-400 flex items-center gap-2">
                  <UserSquare2 className="w-4 h-4" />
                  {t.editor_label_model}
                </label>
                <input
                  ref={modelFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleModelImageUpload}
                />
                {uploadedModelPreview ? (
                  <div className="flex items-center gap-3 p-3 bg-black/30 border border-white/10 rounded-xl">
                    <div 
                      className="relative group cursor-pointer shrink-0"
                      onClick={() => setShowFullPreview(true)}
                    >
                      <img 
                        src={uploadedModelPreview.url} 
                        alt={uploadedModelPreview.name} 
                        className="w-12 h-12 rounded-lg object-cover border border-white/10" 
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                        <Maximize2 className="w-4 h-4 text-white" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-zinc-200 truncate">{uploadedModelPreview.name}</p>
                      <p className="text-[10px] text-zinc-500 uppercase">MODEL</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={isUploadingModel}
                        onClick={() => modelFileInputRef.current?.click()}
                        className="text-[10px] text-orange-400 hover:text-orange-300 font-bold px-2 py-1 rounded bg-orange-500/10 hover:bg-orange-500/20 transition disabled:opacity-50"
                      >
                        {isUploadingModel ? (
                          <span className="flex items-center gap-1"><span className="w-3 h-3 border border-zinc-500 border-t-orange-400 rounded-full animate-spin inline-block" />{t.editor_model_uploading}</span>
                        ) : t.editor_model_change}
                      </button>
                      <button
                        type="button"
                        onClick={() => openAssetPicker('model')}
                        className="text-[10px] text-zinc-300 hover:text-orange-300 font-bold px-2 py-1 rounded bg-white/5 hover:bg-orange-500/15 transition"
                      >
                        {t.wb_btn_choose_from_library || '从素材库选'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setSelectedModelId(null); setUploadedModelPreview(null); }}
                        className="text-[10px] text-zinc-500 hover:text-red-400 font-bold px-2 py-1 rounded bg-white/5 hover:bg-red-500/10 transition"
                      >
                        {t.editor_model_clear}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={isUploadingModel}
                      onClick={() => modelFileInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-2 py-6 border-2 border-dashed border-white/10 rounded-xl text-zinc-500 hover:border-orange-500/50 hover:text-orange-400 hover:bg-orange-500/5 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isUploadingModel ? (
                        <>
                          <span className="w-4 h-4 border-2 border-zinc-500 border-t-orange-500 rounded-full animate-spin" />
                          <span className="text-xs font-bold">{t.editor_model_uploading}</span>
                        </>
                      ) : (
                        <>
                          <UserSquare2 className="w-5 h-5" />
                          <span className="text-xs font-bold">{t.editor_model_upload_btn}</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => openAssetPicker('model')}
                      className="w-full flex items-center justify-center gap-2 py-6 border border-white/10 rounded-xl text-zinc-300 hover:text-orange-300 hover:border-orange-500/50 hover:bg-orange-500/5 transition"
                    >
                      <UserSquare2 className="w-4 h-4" />
                      <span className="text-xs font-bold">{t.wb_btn_choose_from_library || '从素材库选择'}</span>
                    </button>
                  </div>
                )}
            </div>

            <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-400 flex items-center gap-2">
                  <Film className="w-4 h-4" />
                  {t.editor_label_motion || '默认动作视频'}
                </label>
                <input
                  ref={motionFileInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={handleMotionVideoUpload}
                />
                {uploadedMotionPreview ? (
                  <div className="flex items-center gap-3 p-3 bg-black/30 border border-white/10 rounded-xl">
                    <video src={uploadedMotionPreview.url} className="w-16 h-12 rounded-lg object-cover border border-white/10 shrink-0" muted playsInline />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-zinc-200 truncate">{uploadedMotionPreview.name}</p>
                      <p className="text-[10px] text-zinc-500 uppercase">MOTION</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={isUploadingMotion}
                        onClick={() => motionFileInputRef.current?.click()}
                        className="text-[10px] text-orange-400 hover:text-orange-300 font-bold px-2 py-1 rounded bg-orange-500/10 hover:bg-orange-500/20 transition disabled:opacity-50"
                      >
                        {isUploadingMotion ? (t.editor_motion_uploading || '上传中...') : (t.editor_motion_change || '更换')}
                      </button>
                      <button
                        type="button"
                        onClick={() => openAssetPicker('motion')}
                        className="text-[10px] text-zinc-300 hover:text-orange-300 font-bold px-2 py-1 rounded bg-white/5 hover:bg-orange-500/15 transition"
                      >
                        {t.wb_btn_choose_from_library || '从素材库选'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setSelectedMotionId(null); setUploadedMotionPreview(null); }}
                        className="text-[10px] text-zinc-500 hover:text-red-400 font-bold px-2 py-1 rounded bg-white/5 hover:bg-red-500/10 transition"
                      >
                        {t.editor_motion_clear || '移除'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={isUploadingMotion}
                      onClick={() => motionFileInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-2 py-6 border-2 border-dashed border-white/10 rounded-xl text-zinc-500 hover:border-orange-500/50 hover:text-orange-400 hover:bg-orange-500/5 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isUploadingMotion ? (
                        <>
                          <span className="w-4 h-4 border-2 border-zinc-500 border-t-orange-500 rounded-full animate-spin" />
                          <span className="text-xs font-bold">{t.editor_motion_uploading || '上传中...'}</span>
                        </>
                      ) : (
                        <>
                          <Film className="w-5 h-5" />
                          <span className="text-xs font-bold">{t.editor_motion_upload_btn || '上传动作视频'}</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => openAssetPicker('motion')}
                      className="w-full flex items-center justify-center gap-2 py-6 border border-white/10 rounded-xl text-zinc-300 hover:text-orange-300 hover:border-orange-500/50 hover:bg-orange-500/5 transition"
                    >
                      <Film className="w-4 h-4" />
                      <span className="text-xs font-bold">{t.wb_btn_choose_from_library || '从素材库选择'}</span>
                    </button>
                  </div>
                )}
            </div>
            
            <hr className="border-white/5" />
            
            <div className="pt-2 flex justify-end gap-4">
               <button onClick={onClose} className="px-6 py-3 rounded-xl text-sm font-bold text-zinc-400 hover:text-white hover:bg-white/5 transition">{t.editor_btn_cancel}</button>
               <button onClick={handleSave} className="px-8 py-3 rounded-xl text-sm font-bold bg-orange-600 text-white hover:bg-orange-500 shadow-lg shadow-orange-500/20 transition">{t.editor_btn_save}</button>
            </div>
         </div>
      </div>

      {/* Full Image Preview Modal */}
      {showFullPreview && uploadedModelPreview && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 animate-in fade-in duration-200 p-10 cursor-zoom-out"
          onClick={() => setShowFullPreview(false)}
        >
          <button 
            className="absolute top-10 right-10 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition text-white"
            onClick={(e) => { e.stopPropagation(); setShowFullPreview(false); }}
          >
            <X className="w-6 h-6" />
          </button>
          
          <img 
            src={uploadedModelPreview.url} 
            alt={uploadedModelPreview.name}
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          />
          
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white text-sm font-bold">
            {uploadedModelPreview.name}
          </div>
        </div>
      )}

      {assetPickerMode && (
        <AppDialog
          isOpen={!!assetPickerMode}
          title={assetPickerMode === 'model' ? `${t.wb_dialog_choose_from_library || '从素材库选择'}${t.assets_tab_models || '模特'}` : `${t.wb_dialog_choose_from_library || '从素材库选择'}${t.assets_tab_motion || '动作'}`}
          onClose={closeAssetPicker}
          footer={
            <>
              <button className="bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-700" onClick={closeAssetPicker}>关闭</button>
            </>
          }
        >
          <div className="w-[min(86vw,760px)] max-h-[70vh] flex flex-col gap-3">
            <div className="text-xs text-zinc-400">
              {assetPickerMode === 'model' ? (t.editor_label_model || '默认模特') : (t.editor_label_motion || '默认动作视频')}
            </div>
            <div className="min-h-[220px] max-h-[52vh] overflow-y-auto custom-scroll pr-1">
              {assetPickerLoading ? (
                <div className="h-52 flex items-center justify-center text-zinc-400">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> {t.wb_debug_loading || 'Loading...'}
                </div>
              ) : assetPickerError ? (
                <div className="h-52 flex items-center justify-center text-red-300 text-sm">{assetPickerError}</div>
              ) : assetPickerItems.length === 0 ? (
                <div className="h-52 flex items-center justify-center text-zinc-500 text-sm">{t.wb_empty_assets || '暂无可用素材'}</div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {assetPickerItems.map((asset) => (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => chooseAssetFromLibrary(asset)}
                      className="text-left rounded-xl border border-white/10 bg-black/30 p-2 hover:border-orange-500/50 hover:bg-white/5 transition flex flex-col"
                    >
                      <div className="w-full aspect-[3/4] rounded-lg overflow-hidden bg-zinc-800 relative">
                        {asset.media_kind === 'video' ? (
                          <video src={asset.file_url} className="w-full h-full object-cover" muted playsInline />
                        ) : (
                          <img src={asset.file_url} className="w-full h-full object-cover" alt={asset.name} />
                        )}
                        <div className="absolute left-2 top-2 rounded-full border border-white/10 bg-black/50 px-1.5 py-0.5 text-[9px] text-zinc-100">
                          {assetPickerMode === 'model' ? '模特' : '动作'}
                        </div>
                      </div>
                      <div className="mt-2 text-xs font-bold text-zinc-200 truncate">{asset.name}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </AppDialog>
      )}
    </div>
  );
};
