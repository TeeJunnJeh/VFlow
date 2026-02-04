import React, { useState, useEffect, useRef } from 'react';
import { 
  FolderPlus, Upload, Loader2, Folder, Plus, Eye, MoreHorizontal, X, CheckCircle 
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { assetsApi, type Asset, type AssetFolder } from '../../services/assets';
import { LanguageSwitcher } from '../common/LanguageSwitcher';

type AssetType = 'model' | 'product' | 'scene';

interface AssetsViewProps {
  onSelectAsset: (asset: Asset) => void;
  currentFolderId: string | null;
  setCurrentFolderId: (id: string | null) => void;
}

const ASSET_PLACEHOLDER_DATA_URL = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iNDAwIiB2aWV3Qm94PSIwIDAgMzAwIDQwMCI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iIzFmMjkzNyIvPjx0ZXh0IHg9IjE1MCIgeT0iMjAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiBmaWxsPSIjOWNhM2FmIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMjAiPk5vIFByZXZpZXc8L3RleHQ+PC9zdmc+';

export const AssetsView: React.FC<AssetsViewProps> = ({ 
  onSelectAsset, 
  currentFolderId, 
  setCurrentFolderId 
}) => {
  const { t } = useLanguage();

  const assetTabLabel: Record<AssetType, string> = {
    model: t.assets_tab_models,
    product: t.assets_tab_products,
    scene: t.assets_tab_scenes
  };
  
  // Data State
  const [assetList, setAssetList] = useState<Asset[]>([]);
  const [folderList, setFolderList] = useState<AssetFolder[]>([]);
  const [folderBreadcrumb, setFolderBreadcrumb] = useState<AssetFolder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeAssetTab, setActiveAssetTab] = useState<AssetType>('product');
  const [isUploading, setIsUploading] = useState(false);
  
  // UI State
  const [openFolderMenuId, setOpenFolderMenuId] = useState<string | null>(null);
  
  // --- Modal States ---
  
  // 1. Folder Create/Rename
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [folderModalMode, setFolderModalMode] = useState<'create' | 'rename'>('create');
  const [folderModalTarget, setFolderModalTarget] = useState<AssetFolder | null>(null);
  const [folderNameInput, setFolderNameInput] = useState('');
  const [isSavingFolder, setIsSavingFolder] = useState(false);
  const folderNameInputRef = useRef<HTMLInputElement>(null);

  // 2. Move Asset
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [moveAsset, setMoveAsset] = useState<Asset | null>(null);
  const [moveFolders, setMoveFolders] = useState<AssetFolder[]>([]);
  const [moveTargetFolderId, setMoveTargetFolderId] = useState<string | null>(null);
  const [isMoveDropdownOpen, setIsMoveDropdownOpen] = useState(false);
  const [isMovingAsset, setIsMovingAsset] = useState(false);

  // 2.5 Drag & Drop (Move Asset)
  const [draggingAsset, setDraggingAsset] = useState<Asset | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [isDragOverRoot, setIsDragOverRoot] = useState(false);
  const [isDragMoving, setIsDragMoving] = useState(false);

  // 3. Confirm Dialog
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const [confirmIsDanger, setConfirmIsDanger] = useState(false);
  const [confirmIsWorking, setConfirmIsWorking] = useState(false);
  const confirmActionRef = useRef<null | (() => Promise<void> | void)>(null);

  // 4. Preview
  const [isAssetPreviewOpen, setIsAssetPreviewOpen] = useState(false);
  const [assetPreview, setAssetPreview] = useState<Asset | null>(null);

  const assetInputRef = useRef<HTMLInputElement>(null);

  // --- Effects ---
  useEffect(() => {
    loadData();
    // Close menus when tab changes
    setOpenFolderMenuId(null); 
  }, [activeAssetTab, currentFolderId]);

  useEffect(() => {
    if (isFolderModalOpen) {
       setTimeout(() => folderNameInputRef.current?.focus(), 50);
    }
  }, [isFolderModalOpen]);

  // --- API Loaders ---
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [assets, folderData] = await Promise.all([
        assetsApi.getAssets({ type: activeAssetTab, folderId: currentFolderId }),
        assetsApi.getFolders({ type: activeAssetTab, parentId: currentFolderId })
      ]);
      setAssetList(Array.isArray(assets) ? assets : []);
      setFolderList(folderData.folders);
      setFolderBreadcrumb(folderData.breadcrumb);
    } catch (err) {
      console.error("Failed to load assets", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAssetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploading(true);
    try {
      const uploadTasks = Array.from(files).map(file => assetsApi.uploadAsset(file, activeAssetTab, currentFolderId));
      await Promise.all(uploadTasks);
      await loadData();
      
      // --- RESTORED SUCCESS ALERT ---
      alert(`Successfully uploaded ${files.length} files!`); 
      
    } catch (err) {
      alert("Error uploading files");
    } finally {
      setIsUploading(false);
      if (assetInputRef.current) assetInputRef.current.value = '';
    }
  };

  const deleteAssetById = async (id: string) => {
    try {
      await assetsApi.deleteAsset(id);
      setAssetList(prev => prev.filter(a => a.id !== id));
    } catch (err) {
      alert("Failed to delete asset");
    }
  };

  // --- Folder Handlers ---
  const openCreateFolderModal = () => {
    setFolderModalMode('create');
    setFolderModalTarget(null);
    setFolderNameInput('');
    setIsSavingFolder(false);
    setIsFolderModalOpen(true);
  };

  const handleRenameFolder = (folder: AssetFolder) => {
    setOpenFolderMenuId(null);
    setFolderModalMode('rename');
    setFolderModalTarget(folder);
    setFolderNameInput(folder.name);
    setIsSavingFolder(false);
    setIsFolderModalOpen(true);
  };

  const submitFolderModal = async () => {
    const name = folderNameInput.trim();
    if (!name) return;
    setIsSavingFolder(true);
    try {
      if (folderModalMode === 'create') {
        await assetsApi.createFolder(name, activeAssetTab, currentFolderId);
      } else if (folderModalMode === 'rename' && folderModalTarget) {
        await assetsApi.renameFolder(folderModalTarget.id, name);
      }
      await loadData();
      setIsFolderModalOpen(false);
    } catch (err) {
      alert("Failed to save folder");
    } finally {
      setIsSavingFolder(false);
    }
  };

  const handleDeleteFolder = async (folder: AssetFolder) => {
    try {
      await assetsApi.deleteFolder(folder.id);
      if (currentFolderId === folder.id) setCurrentFolderId(null);
      await loadData();
    } catch (err: any) {
      const msg = err?.message || "Failed to delete folder";
      if (msg.toLowerCase().includes('not empty')) {
        alert(t.assets_folder_not_empty_hint);
      } else {
        alert(msg);
      }
    } finally {
        setOpenFolderMenuId(null);
    }
  };

  // --- Move Handlers ---
  const openMoveDialog = async (asset: Asset) => {
    setMoveAsset(asset);
    setMoveTargetFolderId(asset.folder_id ?? null);
    setIsMoveModalOpen(true);
    setIsMoveDropdownOpen(false);
    try {
      const folders = await assetsApi.getAllFolders(activeAssetTab);
      setMoveFolders(folders);
    } catch (err) {
      alert("Failed to load folders for move");
    }
  };

  const beginDragAsset = (asset: Asset, e: React.DragEvent) => {
    setDraggingAsset(asset);
    setDragOverFolderId(null);
    setIsDragOverRoot(false);
    try {
      e.dataTransfer.setData('text/plain', asset.id);
      e.dataTransfer.effectAllowed = 'move';
    } catch {
      // ignore
    }
  };

  const endDragAsset = () => {
    setDraggingAsset(null);
    setDragOverFolderId(null);
    setIsDragOverRoot(false);
    setIsDragMoving(false);
  };

  const dragOverFolder = (folderId: string, e: React.DragEvent) => {
    if (!draggingAsset || isDragMoving) return;
    e.preventDefault();
    setIsDragOverRoot(false);
    setDragOverFolderId(folderId);
    try {
      e.dataTransfer.dropEffect = 'move';
    } catch {
      // ignore
    }
  };

  const dragOverRoot = (e: React.DragEvent) => {
    if (!draggingAsset || isDragMoving) return;
    e.preventDefault();
    setDragOverFolderId(null);
    setIsDragOverRoot(true);
    try {
      e.dataTransfer.dropEffect = 'move';
    } catch {
      // ignore
    }
  };

  const dropMoveTo = async (folderId: string | null, e: React.DragEvent) => {
    if (!draggingAsset || isDragMoving) return;
    e.preventDefault();

    const targetFolderId = folderId;
    if ((draggingAsset.folder_id ?? null) === targetFolderId) {
      endDragAsset();
      return;
    }

    setIsDragMoving(true);
    try {
      await assetsApi.moveAsset(draggingAsset.id, targetFolderId);
      await loadData();
    } catch (err) {
      alert("Failed to move asset");
    } finally {
      endDragAsset();
    }
  };

  const handleConfirmMove = async () => {
    if (!moveAsset) return;
    setIsMovingAsset(true);
    try {
      await assetsApi.moveAsset(moveAsset.id, moveTargetFolderId);
      await loadData();
      setIsMoveModalOpen(false);
    } catch (err) {
      alert("Failed to move asset");
    } finally {
      setIsMovingAsset(false);
    }
  };

  const buildFolderOptions = (folders: AssetFolder[]) => {
    const byParent = new Map<string | null, AssetFolder[]>();
    for (const f of folders) {
      const key = f.parent_id ?? null;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)?.push(f);
    }
    const out: Array<{ id: string; label: string }> = [];
    const walk = (parentId: string | null, depth: number) => {
      const children = byParent.get(parentId) || [];
      for (const child of children) {
        const prefix = depth > 0 ? `${'--'.repeat(depth)} ` : '';
        out.push({ id: child.id, label: `${prefix}${child.name}` });
        walk(child.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  };

  // --- Confirm Modal Helpers ---
  const openConfirmModal = (opts: { title: string; message?: string; danger?: boolean; onConfirm: () => Promise<void> | void }) => {
    setConfirmTitle(opts.title);
    setConfirmMessage(opts.message || null);
    setConfirmIsDanger(Boolean(opts.danger));
    setConfirmIsWorking(false);
    confirmActionRef.current = opts.onConfirm;
    setIsConfirmModalOpen(true);
  };

  const runConfirmAction = async () => {
    if (!confirmActionRef.current) return;
    setConfirmIsWorking(true);
    try {
      await confirmActionRef.current();
      setIsConfirmModalOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setConfirmIsWorking(false);
    }
  };

  // Helper for display URL
  const getDisplayUrl = (path: string | null) => {
     if (!path) return null;
     if (path.startsWith('http')) return path;
     const mediaBaseUrl = import.meta.env.VITE_MEDIA_BASE_URL || '';
     return mediaBaseUrl ? `${mediaBaseUrl}${path}` : path;
  };

  return (
    <div className="flex flex-col h-full z-10 animate-in fade-in slide-in-from-bottom-4 duration-300" onClick={() => setOpenFolderMenuId(null)}>
       {draggingAsset && (
          <div className="fixed inset-0 z-[105] pointer-events-none bg-black/10">
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 glass-panel border border-white/10 rounded-2xl px-4 py-3 shadow-xl max-w-[calc(100vw-2rem)]">
              <div className="text-xs text-zinc-300 truncate">{draggingAsset.name}</div>
              <div className="mt-1 text-sm font-bold text-white flex items-center gap-2">
                {isDragMoving && <Loader2 className="w-4 h-4 animate-spin" />}
                <span className="truncate">
                  {(() => {
                    const dragTitle = (t as any).assets_drag_move_title || t.assets_move_title;
                    if (isDragOverRoot) return `${dragTitle} ${t.assets_move_root}`;
                    if (dragOverFolderId) {
                      const found =
                        folderList.find(f => f.id === dragOverFolderId) ||
                        folderBreadcrumb.find(f => f.id === dragOverFolderId);
                      if (found?.name) return `${dragTitle} ${found.name}`;
                    }
                    return dragTitle;
                  })()}
                </span>
              </div>
            </div>
          </div>
        )}
       <header className="flex justify-between items-center px-10 py-6 border-b border-white/5 shrink-0 bg-black/20 backdrop-blur-sm relative z-50">
          <div><h1 className="text-2xl font-bold tracking-tighter flex items-center gap-3 text-zinc-200">{t.assets_title}</h1><p className="text-zinc-500 text-xs mt-1">{t.assets_subtitle}</p></div>
          <div className="flex gap-3 items-center">
             <LanguageSwitcher />
             <button onClick={openCreateFolderModal} className="bg-zinc-800 text-white px-5 py-2 rounded-lg font-bold text-sm hover:bg-zinc-700 transition flex items-center gap-2"><FolderPlus className="w-4 h-4" /> {t.assets_btn_new_folder}</button>
             <button onClick={() => assetInputRef.current?.click()} className="bg-orange-600 text-white px-5 py-2 rounded-lg font-bold text-sm hover:bg-orange-500 transition flex items-center gap-2 shadow-lg shadow-orange-500/20" disabled={isUploading}>
                {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {t.assets_btn_upload}
             </button>
             <input type="file" ref={assetInputRef} className="hidden" multiple onChange={handleAssetUpload} />
          </div>
       </header>

       <div className="flex-1 flex flex-col p-10 overflow-hidden">
          {/* Tabs */}
          <div className="flex gap-4 mb-8 border-b border-white/5 pb-2">
             {(['model', 'product', 'scene'] as AssetType[]).map(type => (
                <button
                  key={type}
                  onClick={() => {
                    if (type === activeAssetTab) return;
                    setActiveAssetTab(type);
                    setCurrentFolderId(null);
                    setFolderBreadcrumb([]);
                  }}
                  className={`text-sm font-bold px-6 py-2 rounded-full transition ${activeAssetTab === type ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}
                >
                  {assetTabLabel[type] || type.toUpperCase()}
                </button>
             ))}
          </div>
          
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs text-zinc-500 mb-4">
             <button
               onClick={() => setCurrentFolderId(null)}
               onDragOver={dragOverRoot}
               onDragEnter={dragOverRoot}
               onDragLeave={() => setIsDragOverRoot(false)}
               onDrop={(e) => dropMoveTo(null, e)}
               className={`hover:text-white ${currentFolderId === null ? 'text-white' : ''} ${draggingAsset && isDragOverRoot ? 'text-white' : ''}`}
             >
               {t.assets_root}
             </button>
             {folderBreadcrumb.map(folder => (
                <div key={folder.id} className="flex items-center gap-2">
                  <span>/</span>
                  <button
                    onClick={() => setCurrentFolderId(folder.id)}
                    onDragOver={(e) => dragOverFolder(folder.id, e)}
                    onDragEnter={(e) => dragOverFolder(folder.id, e)}
                    onDragLeave={() => { if (dragOverFolderId === folder.id) setDragOverFolderId(null); }}
                    onDrop={(e) => dropMoveTo(folder.id, e)}
                    className={`hover:text-white ${currentFolderId === folder.id ? 'text-white' : ''} ${draggingAsset && dragOverFolderId === folder.id ? 'text-white underline decoration-orange-500/80' : ''}`}
                  >
                    {folder.name}
                  </button>
                </div>
             ))}
          </div>

          <div className="flex-1 overflow-y-auto custom-scroll">
             {isLoading ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-zinc-500" /></div> : (
                <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-6">
                   {/* Folders */}
                   {folderList.map(folder => (
                      <div
                        key={folder.id}
                        onClick={() => setCurrentFolderId(folder.id)}
                        onDragOver={(e) => dragOverFolder(folder.id, e)}
                        onDragEnter={(e) => dragOverFolder(folder.id, e)}
                        onDragLeave={() => { if (dragOverFolderId === folder.id) setDragOverFolderId(null); }}
                        onDrop={(e) => dropMoveTo(folder.id, e)}
                        className={`glass-card rounded-2xl aspect-[3/4] border flex flex-col items-center justify-center gap-3 cursor-pointer transition group relative ${
                          draggingAsset ? 'border-zinc-700/80' : 'border-zinc-800 hover:border-orange-500/50 hover:bg-zinc-900/50'
                        } ${
                          draggingAsset && dragOverFolderId === folder.id ? 'ring-2 ring-orange-500/70 scale-[1.02] bg-zinc-900/50' : ''
                        }`}
                      >
                         <button onClick={(e) => { e.stopPropagation(); setOpenFolderMenuId(prev => (prev === folder.id ? null : folder.id)); }} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center text-zinc-300 hover:text-white z-20">...</button>
                         {openFolderMenuId === folder.id && (
                             <div onClick={(e) => e.stopPropagation()} className="absolute top-10 right-2 bg-zinc-900/90 backdrop-blur-sm border border-white/10 rounded-lg overflow-hidden text-xs z-50 min-w-[140px]">
                                 <button className="w-full text-left px-3 py-2 hover:bg-white/5 text-zinc-200" onClick={() => handleRenameFolder(folder)}>{t.assets_folder_menu_rename}</button>
                                 <button className="w-full text-left px-3 py-2 hover:bg-white/5 text-red-300" onClick={() => { setOpenFolderMenuId(null); openConfirmModal({ title: t.assets_confirm_delete_folder, message: `${folder.name}\n\n${t.assets_confirm_body_irreversible}`, danger: true, onConfirm: () => handleDeleteFolder(folder) }); }}>{t.assets_folder_menu_delete}</button>
                             </div>
                         )}
                         <div className="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center group-hover:scale-110 transition"><Folder className="w-6 h-6 text-zinc-400 group-hover:text-orange-500" /></div>
                         <span className="text-xs font-bold text-zinc-300 truncate max-w-[120px]">{folder.name}</span>
                      </div>
                   ))}
                   
                   {/* Assets */}
                   {assetList.filter(a => a.type === activeAssetTab).map(asset => (
                      <div
                        key={asset.id}
                        className={`glass-card rounded-2xl p-2 group relative ${draggingAsset?.id === asset.id ? 'opacity-60' : ''}`}
                        draggable
                        onDragStart={(e) => beginDragAsset(asset, e)}
                        onDragEnd={endDragAsset}
                      >
                         <div className="aspect-[3/4] bg-zinc-800 rounded-xl overflow-hidden relative cursor-zoom-in" onClick={() => { setAssetPreview(asset); setIsAssetPreviewOpen(true); }}>
                            {asset.file_url ? <img src={getDisplayUrl(asset.file_url) || ASSET_PLACEHOLDER_DATA_URL} className="w-full h-full object-cover" alt={asset.name} onError={(e) => { (e.target as HTMLImageElement).src = ASSET_PLACEHOLDER_DATA_URL; }} /> : <div className="absolute inset-0 flex items-center justify-center text-zinc-600">No Preview</div>}
                            <div className="absolute bottom-3 left-3"><p className="text-xs font-bold text-white truncate w-24">{asset.name}</p></div>
                         </div>
                         <div className="absolute inset-0 bg-black/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition rounded-2xl flex flex-col items-center justify-center gap-2">
                            <button onClick={(e) => { e.stopPropagation(); onSelectAsset(asset); }} className="bg-white text-black px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-orange-500 hover:text-white transition">{t.assets_use_in_workbench}</button>
                            <button onClick={(e) => { e.stopPropagation(); setAssetPreview(asset); setIsAssetPreviewOpen(true); }} className="bg-zinc-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-zinc-600 transition flex items-center gap-2"><Eye className="w-3.5 h-3.5" /> {t.assets_view_image}</button>
                            <button onClick={(e) => { e.stopPropagation(); openMoveDialog(asset); }} className="bg-zinc-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-zinc-600 transition">{t.assets_move_asset}</button>
                            <button onClick={(e) => { e.stopPropagation(); openConfirmModal({ title: t.assets_confirm_delete_asset, message: `${asset.name}\n\n${t.assets_confirm_body_irreversible}`, danger: true, onConfirm: () => deleteAssetById(asset.id) }); }} className="text-red-400 text-xs hover:text-red-300">{t.assets_delete}</button>
                         </div>
                      </div>
                   ))}
                </div>
             )}
          </div>
       </div>

       {/* --- MODALS --- */}

       {/* 1. Preview Modal */}
       {isAssetPreviewOpen && assetPreview && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6" onClick={() => setIsAssetPreviewOpen(false)}>
            <div className="glass-panel rounded-2xl p-4 md:p-6 border border-white/10 w-auto max-w-[calc(100vw-3rem)]" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-4 mb-4"><div className="min-w-0"><h3 className="text-sm font-bold text-zinc-200">{t.assets_preview_title}</h3><div className="text-xs text-zinc-500 truncate">{assetPreview.name}</div></div><button className="text-zinc-400 hover:text-white" onClick={() => setIsAssetPreviewOpen(false)}><X className="w-5 h-5"/></button></div>
              <div className="flex items-center justify-center">
                 <img src={getDisplayUrl(assetPreview.file_url) || ASSET_PLACEHOLDER_DATA_URL} alt={assetPreview.name} className="block rounded-lg" style={{ maxWidth: 'calc(100vw - 6rem)', maxHeight: '72vh', width: 'auto', height: 'auto' }} onError={(e) => { (e.target as HTMLImageElement).src = ASSET_PLACEHOLDER_DATA_URL; }} />
              </div>
            </div>
          </div>
        )}

        {/* 2. Folder Modal (Create / Rename) */}
        {isFolderModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6" onClick={() => setIsFolderModalOpen(false)}>
            <div className="w-full max-w-md glass-panel rounded-2xl p-6 border border-white/10" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4"><h3 className="text-sm font-bold text-zinc-200">{folderModalMode === 'create' ? t.assets_new_folder_title : t.assets_rename_folder_title}</h3><button className="text-zinc-400 hover:text-white" onClick={() => setIsFolderModalOpen(false)}><X className="w-5 h-5"/></button></div>
              <label className="block text-xs text-zinc-500 mb-2">{t.assets_name_label}</label>
              <input ref={folderNameInputRef} className="w-full bg-black/30 text-zinc-200 text-sm rounded-lg border border-white/10 px-3 py-2 focus:outline-none focus:border-orange-500/50" value={folderNameInput} onChange={(e) => setFolderNameInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitFolderModal(); if (e.key === 'Escape') setIsFolderModalOpen(false); }} placeholder={t.assets_new_folder_prompt} />
              <div className="flex justify-end gap-3 mt-5">
                <button className="bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-700" onClick={() => setIsFolderModalOpen(false)}>{t.assets_move_cancel}</button>
                <button className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-orange-500 disabled:opacity-60" onClick={submitFolderModal} disabled={isSavingFolder}>{folderModalMode === 'create' ? t.assets_btn_new_folder : t.assets_save}</button>
              </div>
            </div>
          </div>
        )}

        {/* 3. Move Asset Modal */}
        {isMoveModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6" onClick={() => setIsMoveModalOpen(false)}>
            <div className="w-full max-w-md glass-panel rounded-2xl p-6 border border-white/10" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4"><h3 className="text-sm font-bold text-zinc-200">{t.assets_move_title}</h3><button className="text-zinc-400 hover:text-white" onClick={() => setIsMoveModalOpen(false)}><X className="w-5 h-5"/></button></div>
              <div className="text-xs text-zinc-500 mb-3 truncate">{moveAsset?.name}</div>
              <div className="relative">
                <button className={`w-full bg-black/30 text-zinc-200 text-sm rounded-lg border px-3 py-2 flex items-center justify-between focus:outline-none transition ${isMoveDropdownOpen ? 'border-orange-500/60' : 'border-white/10 hover:border-white/20'}`} onClick={() => setIsMoveDropdownOpen(v => !v)}>
                  <span className="truncate">{(() => { if (!moveTargetFolderId) return t.assets_move_root; const found = moveFolders.find(f => f.id === moveTargetFolderId); return found?.name || t.assets_move_root; })()}</span>
                </button>
                {isMoveDropdownOpen && (
                  <div className="absolute mt-2 w-full max-h-64 overflow-auto rounded-lg border border-white/10 bg-zinc-950/90 backdrop-blur-sm shadow-xl z-[120]">
                    <button className={`w-full text-left px-3 py-2 text-sm hover:bg-white/5 ${moveTargetFolderId === null ? 'text-white' : 'text-zinc-200'}`} onClick={() => { setMoveTargetFolderId(null); setIsMoveDropdownOpen(false); }}>{t.assets_move_root}</button>
                    {buildFolderOptions(moveFolders).map(opt => (<button key={opt.id} className={`w-full text-left px-3 py-2 text-sm hover:bg-white/5 ${moveTargetFolderId === opt.id ? 'text-white' : 'text-zinc-200'}`} onClick={() => { setMoveTargetFolderId(opt.id); setIsMoveDropdownOpen(false); }}>{opt.label}</button>))}
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-3 mt-5">
                <button className="bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-700" onClick={() => setIsMoveModalOpen(false)}>{t.assets_move_cancel}</button>
                <button className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-orange-500 disabled:opacity-60" onClick={handleConfirmMove} disabled={isMovingAsset}>{t.assets_move_confirm}</button>
              </div>
            </div>
          </div>
        )}

        {/* 4. Confirm Dialog */}
        {isConfirmModalOpen && (
          <div className="fixed inset-0 z-[115] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6" onClick={() => setIsConfirmModalOpen(false)}>
            <div className="w-full max-w-md glass-panel rounded-2xl p-6 border border-white/10" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4"><h3 className="text-sm font-bold text-zinc-200">{confirmTitle || t.assets_confirm_title}</h3><button className="text-zinc-400 hover:text-white" onClick={() => setIsConfirmModalOpen(false)}><X className="w-5 h-5"/></button></div>
              {confirmMessage && <div className="text-sm text-zinc-300 whitespace-pre-line">{confirmMessage}</div>}
              <div className="flex justify-end gap-3 mt-5">
                <button className="bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-700 disabled:opacity-60" onClick={() => setIsConfirmModalOpen(false)} disabled={confirmIsWorking}>{t.assets_move_cancel}</button>
                <button className={`px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-60 ${confirmIsDanger ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-orange-600 hover:bg-orange-500 text-white'}`} onClick={runConfirmAction} disabled={confirmIsWorking}>{confirmIsWorking ? '...' : t.assets_delete}</button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
};