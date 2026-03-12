import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  FolderPlus, Upload, Loader2, Folder, X, CheckCircle, Circle, ChevronDown, ChevronRight, Pencil
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { assetsApi, type Asset, type AssetFolder } from '../../services/assets';
import { LanguageSwitcher } from '../common/LanguageSwitcher';

type AssetType = 'model' | 'product' | 'scene' | 'motion';

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
  const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;
  const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp'];
  const VIDEO_EXTS = ['mp4', 'mov', 'mkv', 'webm', 'avi'];
  const AUDIO_EXTS = ['mp3', 'wav', 'flac'];
  const imageFormats = IMAGE_EXTS.join('/');
  const videoFormats = VIDEO_EXTS.join('/');
  const audioFormats = AUDIO_EXTS.join('/');
  const formatHint = `${t.wb_upload_image}: ${imageFormats}\n${t.wb_upload_video}: ${videoFormats}\n${t.wb_upload_audio}: ${audioFormats}\n${t.wb_upload_max_size}`;

  const validateUploadFile = (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) return `${t.assets_upload_error_too_large}: ${file.name} (>1GB)`;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isImage = file.type.startsWith('image/') || IMAGE_EXTS.includes(ext);
    const isVideo = file.type.startsWith('video/') || VIDEO_EXTS.includes(ext);
    const isAudio = file.type.startsWith('audio/') || AUDIO_EXTS.includes(ext);
    if (!isImage && !isVideo && !isAudio) return `${t.assets_upload_error_unsupported}: ${file.name}`;
    return null;
  };

  const assetTabLabel: Record<AssetType, string> = {
    model: t.assets_tab_models,
    product: t.assets_tab_products,
    scene: t.assets_tab_scenes,
    motion: t.assets_tab_motion
  };
  
  // Data State
  const [assetList, setAssetList] = useState<Asset[]>([]);
  const [folderList, setFolderList] = useState<AssetFolder[]>([]);
  const [folderBreadcrumb, setFolderBreadcrumb] = useState<AssetFolder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeAssetTab, setActiveAssetTab] = useState<AssetType>('product');
  const [isUploading, setIsUploading] = useState(false);
  const [isDragUploadActive, setIsDragUploadActive] = useState(false);
  
  // UI State
  const [openFolderMenuId, setOpenFolderMenuId] = useState<string | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());

  // Inline rename (asset)
  const [renamingAssetId, setRenamingAssetId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [isSavingRename, setIsSavingRename] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const renameIgnoreBlurRef = useRef(false);
  const suppressPreviewClickUntilRef = useRef<number>(0);
  const suppressDragUntilRef = useRef<number>(0);
  
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
  const [moveAssets, setMoveAssets] = useState<Asset[]>([]);
  const [moveFolder, setMoveFolder] = useState<AssetFolder | null>(null);
  const [moveFolders, setMoveFolders] = useState<AssetFolder[]>([]);
  const [moveTargetFolderId, setMoveTargetFolderId] = useState<string | null>(null);
  const [isMoveDropdownOpen, setIsMoveDropdownOpen] = useState(false);
  const [isMovingAsset, setIsMovingAsset] = useState(false);
  const [moveExpandedFolderIds, setMoveExpandedFolderIds] = useState<Set<string>>(new Set());

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

  // --- API Loaders ---
  const loadData = useCallback(async () => {
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
  }, [activeAssetTab, currentFolderId]);

  // --- Effects ---
  useEffect(() => {
    void loadData();
    // Close menus when tab changes
    setOpenFolderMenuId(null); 
    // Reset selection when scope changes
    setIsSelectionMode(false);
    setSelectedAssetIds(new Set());
  }, [loadData]);

  useEffect(() => {
    if (isFolderModalOpen) {
       setTimeout(() => folderNameInputRef.current?.focus(), 50);
    }
  }, [isFolderModalOpen]);

  useEffect(() => {
    if (!isSelectionMode && selectedAssetIds.size > 0) {
      setSelectedAssetIds(new Set());
    }
  }, [isSelectionMode, selectedAssetIds.size]);

  useEffect(() => {
    if (!renamingAssetId) return;
    const timer = window.setTimeout(() => {
      const el = renameInputRef.current;
      if (!el) return;
      el.focus();
      el.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [renamingAssetId]);

  const uploadFiles = async (files: FileList | File[]) => {
    const errors: string[] = [];
    const validFiles: File[] = [];
    Array.from(files).forEach(file => {
      const err = validateUploadFile(file);
      if (err) errors.push(err);
      else validFiles.push(file);
    });
    if (errors.length > 0) alert(`${errors.join('\n')}\n\n${t.assets_upload_formats_title}:\n${formatHint}`);
    if (validFiles.length === 0) return;
    setIsUploading(true);
    try {
      const uploadTasks = validFiles.map(file => assetsApi.uploadAsset(file, activeAssetTab, currentFolderId));
      await Promise.all(uploadTasks);
      await loadData();
      alert(`Successfully uploaded ${validFiles.length} files!`); 
    } catch (err) {
      console.error(err);
      alert("Error uploading files");
    } finally {
      setIsUploading(false);
    }
  };

  const handleAssetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await uploadFiles(files);
    if (assetInputRef.current) assetInputRef.current.value = '';
  };

  const handleUploadDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types?.includes('Files')) return;
    e.preventDefault();
    setIsDragUploadActive(true);
  };

  const handleUploadDragLeave = (e: React.DragEvent) => {
    if (!e.dataTransfer.types?.includes('Files')) return;
    e.preventDefault();
    setIsDragUploadActive(false);
  };

  const handleUploadDrop = async (e: React.DragEvent) => {
    if (!e.dataTransfer.types?.includes('Files')) return;
    e.preventDefault();
    setIsDragUploadActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await uploadFiles(e.dataTransfer.files);
    }
  };

  const deleteAssetById = async (id: string) => {
    try {
      await assetsApi.deleteAsset(id);
      setAssetList(prev => prev.filter(a => a.id !== id));
    } catch (err) {
      console.error(err);
      alert("Failed to delete asset");
    }
  };

  const beginRenameAsset = (asset: Asset) => {
    setRenamingAssetId(asset.id);
    setRenameDraft(asset.name || '');
  };

  const cancelRenameAsset = () => {
    setRenamingAssetId(null);
    setRenameDraft('');
    setIsSavingRename(false);
    renameIgnoreBlurRef.current = false;
  };

  const commitRenameAsset = async (asset: Asset) => {
    if (isSavingRename) return;
    const nextName = renameDraft.trim();
    if (!nextName || nextName === asset.name) {
      cancelRenameAsset();
      return;
    }

    setIsSavingRename(true);
    renameIgnoreBlurRef.current = true;
    try {
      const resp = await assetsApi.renameAsset(asset.id, nextName);
      const serverName = (resp?.display_name || resp?.name || nextName) as string;
      setAssetList(prev => prev.map(a => (a.id === asset.id ? { ...a, name: serverName } : a)));
      cancelRenameAsset();
    } catch (err) {
      console.error(err);
      alert("Failed to rename asset");
      cancelRenameAsset();
    } finally {
      renameIgnoreBlurRef.current = false;
    }
  };

  const exitSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedAssetIds(new Set());
  };


  const toggleAssetSelection = (assetId: string) => {
    setSelectedAssetIds(prev => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };

  const selectAllVisibleAssets = () => {
    const visible = assetList.filter(a => a.type === activeAssetTab);
    setSelectedAssetIds(new Set(visible.map(a => a.id)));
  };

  const deselectAllVisibleAssets = () => {
    setSelectedAssetIds(new Set());
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
      console.error(err);
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err || "Failed to delete folder");
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
  const computeExpandedForTarget = (folders: AssetFolder[], targetFolderId: string | null) => {
    if (!targetFolderId) return new Set<string>();
    const parentById = new Map<string, string | null>();
    for (const f of folders) parentById.set(f.id, f.parent_id ?? null);

    const expanded = new Set<string>();
    const visited = new Set<string>();

    let cur = parentById.get(targetFolderId) ?? null;
    while (cur) {
      if (visited.has(cur)) break;
      visited.add(cur);
      expanded.add(cur);
      cur = parentById.get(cur) ?? null;
    }
    return expanded;
  };

  const openMoveDialog = async (assets: Asset[], defaultTargetFolderId?: string | null) => {
    setMoveAssets(assets);
    setMoveFolder(null);
    setMoveTargetFolderId(defaultTargetFolderId ?? null);
    setIsMoveModalOpen(true);
    setIsMoveDropdownOpen(false);
    setMoveExpandedFolderIds(new Set());
    try {
      const folders = await assetsApi.getAllFolders(activeAssetTab);
      setMoveFolders(folders);
      setMoveExpandedFolderIds(computeExpandedForTarget(folders, defaultTargetFolderId ?? null));
    } catch (err) {
      console.error(err);
      alert("Failed to load folders for move");
    }
  };

  const openSingleMoveDialog = (asset: Asset) => {
    void openMoveDialog([asset], asset.folder_id ?? null);
  };

  const openFolderMoveDialog = async (folder: AssetFolder) => {
    setMoveAssets([]);
    setMoveFolder(folder);
    setMoveTargetFolderId(folder.parent_id ?? null);
    setIsMoveModalOpen(true);
    setIsMoveDropdownOpen(false);
    setMoveExpandedFolderIds(new Set());
    try {
      const folders = await assetsApi.getAllFolders(activeAssetTab);
      setMoveFolders(folders);
      setMoveExpandedFolderIds(computeExpandedForTarget(folders, folder.parent_id ?? null));
    } catch (err) {
      console.error(err);
      alert("Failed to load folders for move");
    }
  };

  const openBatchMoveDialog = () => {
    const selected = assetList.filter(a => selectedAssetIds.has(a.id));
    if (selected.length === 0) return;
    void openMoveDialog(selected, currentFolderId ?? null);
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
      console.error(err);
      alert("Failed to move asset");
    } finally {
      endDragAsset();
    }
  };

  const handleConfirmMove = async () => {
    if (moveAssets.length === 0 && !moveFolder) return;
    setIsMovingAsset(true);
    try {
      if (moveFolder) {
        const from = moveFolder.parent_id ?? null;
        const to = moveTargetFolderId ?? null;
        if (from !== to) {
          await assetsApi.moveFolder(moveFolder.id, to);
          await loadData();
        }
        setIsMoveModalOpen(false);
        return;
      }

      const results = await Promise.allSettled(
        moveAssets.map(a => {
          const from = a.folder_id ?? null;
          const to = moveTargetFolderId ?? null;
          if (from === to) return Promise.resolve(null);
          return assetsApi.moveAsset(a.id, moveTargetFolderId);
        })
      );

      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length > 0) alert("Failed to move some assets");
      await loadData();
      setIsMoveModalOpen(false);
      setSelectedAssetIds(new Set());
      if (isSelectionMode) setIsSelectionMode(false);
    } catch (err) {
      console.error(err);
      alert("Failed to move asset");
    } finally {
      setIsMovingAsset(false);
    }
  };

  const buildFolderTree = (folders: AssetFolder[]) => {
    const byParent = new Map<string | null, AssetFolder[]>();
    for (const f of folders) {
      const key = f.parent_id ?? null;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(f);
    }
    for (const list of byParent.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return byParent;
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

  const visibleAssets = assetList.filter(a => a.type === activeAssetTab);
  const selectedCount = selectedAssetIds.size;
  const isAllVisibleSelected = visibleAssets.length > 0 && visibleAssets.every(a => selectedAssetIds.has(a.id));

  const moveSubjectLabel = moveFolder
    ? moveFolder.name
    : (moveAssets.length === 1 ? moveAssets[0]?.name : `${moveAssets.length} ${t.assets_items}`);

  const moveFoldersByParent = buildFolderTree(moveFolders);

  const invalidMoveTargetIds = (() => {
    if (!moveFolder) return new Set<string>();
    const invalid = new Set<string>([moveFolder.id]);
    const stack = [moveFolder.id];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      const children = moveFoldersByParent.get(cur) || [];
      for (const child of children) {
        if (invalid.has(child.id)) continue;
        invalid.add(child.id);
        stack.push(child.id);
      }
    }
    return invalid;
  })();

  const toggleMoveExpanded = (folderId: string) => {
    setMoveExpandedFolderIds(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  // Returns the full path of the current move target folder, e.g. "FolderA / SubB"
  // const getMoveTargetDisplayPath = () => {
  //   if (!moveTargetFolderId) return t.assets_move_root;
  //   if (moveFolders.length === 0) return '...';
  //   const parentMap = new Map<string, string | null>();
  //   const nameMap = new Map<string, string>();
  //   for (const f of moveFolders) {
  //     parentMap.set(f.id, f.parent_id ?? null);
  //     nameMap.set(f.id, f.name);
  //   }
  //   const parts: string[] = [];
  //   let cur: string | null = moveTargetFolderId;
  //   const visited = new Set<string>();
  //   while (cur && !visited.has(cur)) {
  //     visited.add(cur);
  //     const name = nameMap.get(cur);
  //     if (name) parts.unshift(name);
  //     cur = parentMap.get(cur) ?? null;
  //   }
  //   return parts.length > 0 ? parts.join(' / ') : t.assets_move_root;
  // };

  return (
    <div
      className="flex flex-col h-full z-10 animate-in fade-in slide-in-from-bottom-4 duration-300 relative"
      onClick={() => setOpenFolderMenuId(null)}
      onDragOver={handleUploadDragOver}
      onDragEnter={handleUploadDragOver}
      onDragLeave={handleUploadDragLeave}
      onDrop={handleUploadDrop}
    >
       {isDragUploadActive && (
         <div className="absolute inset-0 z-[120] rounded-3xl border-2 border-dashed border-orange-500/60 bg-orange-500/10 backdrop-blur-sm flex items-center justify-center pointer-events-none">
           <div className="text-sm font-bold text-orange-200">{t.assets_upload_drop_here}</div>
         </div>
       )}
       {draggingAsset && (
          <div className="fixed inset-0 z-[105] pointer-events-none bg-black/10">
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 glass-panel border border-white/10 rounded-2xl px-4 py-3 shadow-xl max-w-[calc(100vw-2rem)]">
              <div className="text-xs text-zinc-300 truncate">{draggingAsset.name}</div>
              <div className="mt-1 text-sm font-bold text-white flex items-center gap-2">
                {isDragMoving && <Loader2 className="w-4 h-4 animate-spin" />}
                <span className="truncate">
                   {(() => {
                    const dragTitle = t.assets_drag_move_title;
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
             <div className="relative group">
               <button onClick={() => assetInputRef.current?.click()} className="bg-orange-600 text-white px-5 py-2 rounded-lg font-bold text-sm hover:bg-orange-500 transition flex items-center gap-2 shadow-lg shadow-orange-500/20" disabled={isUploading}>
                  {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {t.assets_btn_upload}
               </button>
               <div className="absolute right-0 top-12 z-50 w-max max-w-[360px] rounded-xl border border-white/10 bg-zinc-900/95 px-3 py-2 text-[10px] text-zinc-100 opacity-0 shadow-xl backdrop-blur transition group-hover:opacity-100 hover:opacity-100">
                 <div className="text-[11px] font-bold text-white mb-1">{t.assets_upload_formats_title}</div>
                 <div className="whitespace-pre-line text-zinc-300 leading-relaxed">{formatHint}</div>
               </div>
             </div>
             <input type="file" ref={assetInputRef} className="hidden" multiple accept="image/*,video/*,audio/*" onChange={handleAssetUpload} />
          </div>
       </header>

       <div className="flex-1 flex flex-col px-10 pt-4 pb-10 overflow-hidden">
          {/* Tabs */}
          <div className="flex gap-4 mb-8 border-b border-white/5 pb-2">
             {(['model', 'product', 'scene', 'motion'] as AssetType[]).map(type => (
                <button
                  key={type}
                  onClick={() => {
                    if (type === activeAssetTab) return;
                    setActiveAssetTab(type);
                    setCurrentFolderId(null);
                    setFolderBreadcrumb([]);
                  }}
                  className={`asset-type-tab text-sm font-bold px-6 py-2 rounded-full transition ${activeAssetTab === type ? 'asset-type-tab--active' : 'asset-type-tab--inactive'}`}
                >
                  {assetTabLabel[type] || type.toUpperCase()}
                </button>
             ))}
          </div>
          
           {/* Breadcrumb */}
            <div className="flex items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-2 text-xs text-zinc-500 min-w-0">
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
                  <div key={folder.id} className="flex items-center gap-2 min-w-0">
                    <span>/</span>
                    <button
                      onClick={() => setCurrentFolderId(folder.id)}
                      onDragOver={(e) => dragOverFolder(folder.id, e)}
                      onDragEnter={(e) => dragOverFolder(folder.id, e)}
                      onDragLeave={() => { if (dragOverFolderId === folder.id) setDragOverFolderId(null); }}
                      onDrop={(e) => dropMoveTo(folder.id, e)}
                      className={`hover:text-white truncate ${currentFolderId === folder.id ? 'text-white' : ''} ${draggingAsset && dragOverFolderId === folder.id ? 'text-white underline decoration-orange-500/80' : ''}`}
                    >
                      {folder.name}
                    </button>
                  </div>
                ))}
              </div>

              {!isSelectionMode && (
                <button
                  onClick={() => setIsSelectionMode(true)}
                  className="bg-zinc-800 text-white px-3 py-1.5 rounded-lg font-bold text-xs hover:bg-zinc-700 transition flex items-center gap-2 shrink-0"
                >
                  <CheckCircle className="w-4 h-4" /> {t.assets_select}
                </button>
              )}
            </div>

            {/* Selection Toolbar */}
            {isSelectionMode && (
              <div className="flex items-center justify-between mb-4">
                <div className="text-[11px] text-zinc-500">
                  <span>
                    {selectedCount} {t.assets_selected}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={isAllVisibleSelected ? deselectAllVisibleAssets : selectAllVisibleAssets}
                    disabled={visibleAssets.length === 0}
                    className="bg-zinc-900 text-zinc-200 px-3 py-1.5 rounded-lg font-bold text-xs hover:bg-zinc-800 transition disabled:opacity-50"
                  >
                    {isAllVisibleSelected ? t.assets_deselect_all : t.assets_select_all}
                  </button>
                  <button
                    onClick={openBatchMoveDialog}
                    disabled={selectedCount === 0}
                    className="bg-orange-600 text-white px-3 py-1.5 rounded-lg font-bold text-xs hover:bg-orange-500 transition disabled:opacity-50"
                  >
                    {t.assets_move_asset}
                  </button>
                  <button
                    onClick={() => {
                      if (selectedCount === 0) return;
                      openConfirmModal({
                        title: t.assets_confirm_delete_asset,
                        message: `${selectedCount} ${t.assets_items}\n\n${t.assets_confirm_body_irreversible}`,
                        danger: true,
                        onConfirm: async () => {
                          const ids = Array.from(selectedAssetIds);
                          const results = await Promise.allSettled(ids.map(id => assetsApi.deleteAsset(id)));
                          const failed = results.filter(r => r.status === 'rejected');
                          if (failed.length > 0) alert("Failed to delete some assets");
                          await loadData();
                          setSelectedAssetIds(new Set());
                          setIsSelectionMode(false);
                        }
                      });
                    }}
                    disabled={selectedCount === 0}
                    className="bg-red-600 text-white px-3 py-1.5 rounded-lg font-bold text-xs hover:bg-red-500 transition disabled:opacity-50"
                  >
                    {t.assets_delete}
                  </button>
                  <button
                    onClick={exitSelectionMode}
                    className="bg-zinc-800 text-white px-3 py-1.5 rounded-lg font-bold text-xs hover:bg-zinc-700 transition"
                  >
                    {t.assets_done}
                  </button>
                </div>
              </div>
            )}

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
                                 <button className="w-full text-left px-3 py-2 hover:bg-white/5 text-zinc-200" onClick={() => { setOpenFolderMenuId(null); void openFolderMoveDialog(folder); }}>{t.assets_move_asset}</button>
                                 <button className="w-full text-left px-3 py-2 hover:bg-white/5 text-red-300" onClick={() => { setOpenFolderMenuId(null); openConfirmModal({ title: t.assets_confirm_delete_folder, message: `${folder.name}\n\n${t.assets_confirm_body_irreversible}`, danger: true, onConfirm: () => handleDeleteFolder(folder) }); }}>{t.assets_folder_menu_delete}</button>
                             </div>
                         )}
                         <div className="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center group-hover:scale-110 transition"><Folder className="w-6 h-6 text-zinc-400 group-hover:text-orange-500" /></div>
                         <span className="text-xs font-bold text-zinc-300 truncate max-w-[120px]">{folder.name}</span>
                      </div>
                    ))}
                    
                    {/* Assets */}
                    {visibleAssets.map(asset => {
                      const isSelected = selectedAssetIds.has(asset.id);
                      return (
                        <div
                          key={asset.id}
                          className={`glass-card rounded-2xl p-2 group relative aspect-[3/4] ${draggingAsset?.id === asset.id ? 'opacity-60' : ''} ${isSelectionMode && isSelected ? 'ring-2 ring-orange-500/70' : ''}`}
                          draggable={!isSelectionMode && renamingAssetId !== asset.id}
                          onDragStart={isSelectionMode ? undefined : (e) => {
                            if (renamingAssetId || Date.now() < suppressDragUntilRef.current) {
                              e.preventDefault();
                              return;
                            }
                            beginDragAsset(asset, e);
                          }}
                          onDragEnd={isSelectionMode ? undefined : endDragAsset}
                        >
                          {isSelectionMode && (
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleAssetSelection(asset.id); }}
                              className="absolute top-3 left-3 z-20 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center text-white transition"
                              aria-label="Select asset"
                            >
                              {isSelected ? <CheckCircle className="w-5 h-5 text-orange-400" /> : <Circle className="w-5 h-5 text-white/70" />}
                            </button>
                          )}
                          <div
                            className={`w-full h-full bg-zinc-800 rounded-xl overflow-hidden relative ${isSelectionMode ? 'cursor-pointer' : 'cursor-zoom-in'}`}
                            onClick={() => {
                              if (Date.now() < suppressPreviewClickUntilRef.current) {
                                suppressPreviewClickUntilRef.current = 0;
                                return;
                              }
                              if (renamingAssetId === asset.id) return;
                              if (isSelectionMode) {
                                toggleAssetSelection(asset.id);
                                return;
                              }
                              setAssetPreview(asset);
                              setIsAssetPreviewOpen(true);
                            }}
                          >
                            {asset.file_url && asset.media_kind === 'video' ? (
                              <video
                                src={getDisplayUrl(asset.file_url) || undefined}
                                className="absolute inset-0 w-full h-full object-cover"
                                muted
                                playsInline
                                preload="metadata"
                              />
                            ) : asset.file_url ? (
                              <img
                                src={getDisplayUrl(asset.file_url) || ASSET_PLACEHOLDER_DATA_URL}
                                className="absolute inset-0 w-full h-full object-cover"
                                alt={asset.name}
                                onError={(e) => { (e.target as HTMLImageElement).src = ASSET_PLACEHOLDER_DATA_URL; }}
                              />
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center text-zinc-600">No Preview</div>
                            )}
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 asset-thumb-fade" />

                            {/* Info bar (always on top) */}
                            <div className="absolute bottom-1 left-2.5 right-2.5 z-30 pointer-events-auto">
                              <div className="flex items-center gap-1.5">
                                {renamingAssetId === asset.id ? (
                                  <input
                                    ref={renameInputRef}
                                    value={renameDraft}
                                    disabled={isSavingRename}
                                    className="min-w-0 flex-1 bg-black/40 text-zinc-100 text-xs font-bold rounded-md border border-white/10 px-2 py-1 focus:outline-none focus:border-orange-500/50"
                                    onChange={(e) => setRenameDraft(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    onMouseDown={(e) => {
                                      e.stopPropagation();
                                      suppressDragUntilRef.current = Date.now() + 500;
                                    }}
                                    onDragStart={(e) => e.preventDefault()}
                                    onBlur={() => {
                                      if (renameIgnoreBlurRef.current) return;
                                      // Prevent the click that caused blur from also opening preview.
                                      suppressPreviewClickUntilRef.current = Date.now() + 350;
                                      void commitRenameAsset(asset);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        void commitRenameAsset(asset);
                                      }
                                      if (e.key === 'Escape') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        cancelRenameAsset();
                                      }
                                    }}
                                  />
                                ) : (
                                  <div
                                    className="min-w-0 flex items-center gap-1 cursor-text"
                                    title={asset.name}
                                    onMouseDown={(e) => {
                                      e.stopPropagation();
                                      suppressDragUntilRef.current = Date.now() + 500;
                                    }}
                                    onClick={(e) => { e.stopPropagation(); beginRenameAsset(asset); }}
                                  >
                                    <span className="min-w-0 truncate text-xs font-bold asset-meta-name hover:underline decoration-white/30">
                                      {asset.name}
                                    </span>
                                    {renamingAssetId !== asset.id && !isSelectionMode && (
                                      <button
                                        type="button"
                                        aria-label={t.assets_folder_menu_rename}
                                        title={t.assets_folder_menu_rename}
                                        className="shrink-0 rounded-md p-1 text-zinc-200/80 hover:text-white hover:bg-white/10 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition"
                                        onClick={(e) => { e.stopPropagation(); beginRenameAsset(asset); }}
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="text-[11px] asset-meta-size">
                                {asset.size}
                              </div>
                            </div>

                            {/* Hover actions (under info bar) */}
                            {!isSelectionMode && (
                              <div className="absolute inset-0 z-10 bg-black/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition rounded-xl flex flex-col items-center justify-center gap-2 py-4 px-2">
                                <button onClick={(e) => { e.stopPropagation(); onSelectAsset(asset); }} className="w-full bg-white text-black py-2 rounded-lg text-xs font-bold hover:bg-orange-500 hover:text-white transition shadow-lg">{t.assets_use_in_workbench}</button>
                                <div className="flex w-full gap-2">
                                  <button onClick={(e) => { e.stopPropagation(); openSingleMoveDialog(asset); }} className="flex-1 bg-zinc-700 text-white py-2 rounded-lg text-xs font-bold hover:bg-zinc-600 transition">{t.assets_move_asset}</button>
                                  <button onClick={(e) => { e.stopPropagation(); openConfirmModal({ title: t.assets_confirm_delete_asset, message: `${asset.name}\n\n${t.assets_confirm_body_irreversible}`, danger: true, onConfirm: () => deleteAssetById(asset.id) }); }} className="flex-1 bg-zinc-800 text-red-400 py-2 rounded-lg text-xs font-bold hover:bg-red-500 hover:text-white transition">{t.assets_delete}</button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                 </div>
              )}
           </div>
       </div>

       {/* --- MODALS --- */}

       {/* 1. Preview Modal */}
       {isAssetPreviewOpen && assetPreview && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6" onClick={() => setIsAssetPreviewOpen(false)}>
            <div className="glass-panel rounded-2xl p-4 md:p-6 border border-white/10 w-auto max-w-[calc(100vw-3rem)] max-h-[calc(100vh-3rem)] overflow-auto">
              <div className="flex items-center justify-between gap-4 mb-4"><div className="min-w-0"><h3 className="text-sm font-bold text-zinc-200">{t.assets_preview_title}</h3><div className="text-xs text-zinc-500 truncate">{assetPreview.name}</div></div><button className="text-zinc-400 hover:text-white" onClick={() => setIsAssetPreviewOpen(false)}><X className="w-5 h-5"/></button></div>
              <div className="flex items-center justify-center">
                 {assetPreview.media_kind === 'video' ? (
                   <video
                     src={getDisplayUrl(assetPreview.file_url) || undefined}
                     className="block rounded-lg max-w-full max-h-[calc(100vh-10rem)] object-contain"
                     controls
                     autoPlay
                     loop
                     playsInline
                   />
                 ) : (
                   <img
                     src={getDisplayUrl(assetPreview.file_url) || ASSET_PLACEHOLDER_DATA_URL}
                     alt={assetPreview.name}
                     className="block rounded-lg max-w-full max-h-[calc(100vh-10rem)] object-contain"
                     onError={(e) => { (e.target as HTMLImageElement).src = ASSET_PLACEHOLDER_DATA_URL; }}
                   />
                 )}
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
            <div className="w-full max-w-sm glass-panel rounded-2xl p-6 border border-white/10" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4"><h3 className="text-sm font-bold text-zinc-200">{moveFolder ? t.assets_move_folder_title : (moveAssets.length > 1 ? t.assets_move_items_title : t.assets_move_title)}</h3><button className="text-zinc-400 hover:text-white" onClick={() => setIsMoveModalOpen(false)}><X className="w-5 h-5"/></button></div>
              <div className="text-xs text-zinc-500 mb-3 truncate">{moveSubjectLabel}</div>
              <div className="relative">
                <button className={`w-full bg-black/30 text-zinc-200 text-[13px] rounded-lg border px-3 py-2 flex items-center justify-between focus:outline-none transition ${isMoveDropdownOpen ? 'border-orange-500/60' : 'border-white/10 hover:border-white/20'}`} onClick={() => setIsMoveDropdownOpen(v => !v)}>
                  <span className="truncate">{(() => { if (!moveTargetFolderId) return t.assets_move_root; const found = moveFolders.find(f => f.id === moveTargetFolderId); return found?.name || t.assets_move_root; })()}</span>
                  <ChevronDown className={`w-4 h-4 shrink-0 transition ${isMoveDropdownOpen ? 'rotate-180 text-orange-400' : 'text-zinc-400'}`} />
                </button>
                {isMoveDropdownOpen && (
                  <div className="absolute mt-2 w-full max-h-64 overflow-auto custom-scroll rounded-lg border border-white/10 bg-zinc-950/90 backdrop-blur-sm shadow-xl z-[120] pr-2">
                    <button className={`w-full text-left px-3 py-2 text-[13px] hover:bg-white/5 ${moveTargetFolderId === null ? 'text-white' : 'text-zinc-200'}`} onClick={() => { setMoveTargetFolderId(null); setIsMoveDropdownOpen(false); }}>{t.assets_move_root}</button>
                    {(moveFoldersByParent.get(null) || [])
                      .filter(f => !moveFolder || !invalidMoveTargetIds.has(f.id))
                      .map(f => {
                        const renderNode = (node: AssetFolder, depth: number): React.ReactNode => {
                          if (moveFolder && invalidMoveTargetIds.has(node.id)) return null;
                          const childrenAll = moveFoldersByParent.get(node.id) || [];
                          const children = moveFolder ? childrenAll.filter(c => !invalidMoveTargetIds.has(c.id)) : childrenAll;
                          const hasChildren = children.length > 0;
                          const isExpanded = moveExpandedFolderIds.has(node.id);
                          const isSelected = moveTargetFolderId === node.id;
                          const depthText =
                            depth === 0 ? 'text-zinc-200' : depth === 1 ? 'text-zinc-300' : 'text-zinc-400';

                          return (
                            <div key={node.id}>
                              <button
                                type="button"
                                className={`w-full text-left px-3 py-2 text-[13px] flex items-center justify-between select-none ${
                                  isSelected ? 'bg-orange-500/15 text-white font-medium' : `hover:bg-white/5 ${depthText}`
                                }`}
                                style={{ paddingLeft: 12 + depth * 14 }}
                                onClick={() => { setMoveTargetFolderId(node.id); setIsMoveDropdownOpen(false); }}
                              >
                                <span className="truncate">{node.name}</span>
                                {hasChildren && (
                                  <span
                                    role="button"
                                    className="ml-2 w-6 h-6 rounded-md hover:bg-white/5 text-zinc-400 hover:text-white flex items-center justify-center shrink-0"
                                    onClick={(e) => { e.stopPropagation(); toggleMoveExpanded(node.id); }}
                                    aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
                                  >
                                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                  </span>
                                )}
                              </button>
                              {hasChildren && isExpanded && children.map(c => renderNode(c, depth + 1))}
                            </div>
                          );
                        };

                        return renderNode(f, 0);
                      })}
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
