import React from 'react';
import { Film, Image as ImageIcon, Library, Loader2, Sparkles, Trash2, X } from 'lucide-react';
import { AssetLibraryPickerDialog, type AssetLibraryPickedAsset, type AssetLibraryPickerTabConfig } from '../productImages/Common/AssetLibraryPickerDialog';
import { CommunityHistoryPicker, type CommunityHistoryPicked } from './CommunityHistoryPicker';
import { videoApi } from '../../services/video';
import type { CommunityCreateDraft, CommunityMediaRef, CommunityPost, CommunityPostType, CommunitySharedSkill } from '../../services/community';

type CommunityAssetTab = 'product' | 'motion' | 'audio' | 'script' | 'model' | 'scene';

const COMMUNITY_ASSET_TABS: AssetLibraryPickerTabConfig<CommunityAssetTab>[] = [
  { key: 'product', assetType: 'product', fallbackLabel: 'Images' },
  { key: 'motion', assetType: 'motion', fallbackLabel: 'Videos' },
  { key: 'audio', assetType: 'audio', fallbackLabel: 'Audio' },
  { key: 'script', assetType: 'script', fallbackLabel: 'Scripts' },
  { key: 'model', assetType: 'model', fallbackLabel: 'Models' },
  { key: 'scene', assetType: 'scene', fallbackLabel: 'Scenes' },
];

interface PickedLibraryAsset {
  id: string;
  name: string;
  assetType: string;
  fileUrl: string;
  thumbnail?: string;
}

interface ComposerHistoryItem {
  kind: 'image' | 'video';
  url: string;
  name: string;
  thumbnail_url?: string;
  source_project_id?: string;
  skill?: CommunitySharedSkill | null;
  skillLoading?: boolean;
}

interface CommunityComposerDialogProps {
  isOpen: boolean;
  isSubmitting?: boolean;
  initialPost?: CommunityPost | null;
  labels: {
    close: string;
    cancel: string;
    submit: string;
    submitting: string;
    titlePlaceholder: string;
    bodyPlaceholder: string;
    materialType: string;
    experienceType: string;
    assetPickerTitle: string;
    [key: string]: string;
  };
  onClose: () => void;
  onSubmit?: (draft: CommunityCreateDraft) => void | Promise<void>;
}

// 素材库资产类型 → 是否可作为帖子展示媒体（及其 kind）
const viewableKindOf = (assetType: string): 'image' | 'video' | 'audio' | null => {
  const t = (assetType || '').toLowerCase();
  if (t === 'motion') return 'video';
  if (t === 'audio') return 'audio';
  if (t === 'product' || t === 'scene' || t === 'model') return 'image';
  return null; // script / skill：仅作为可收集素材，不作展示媒体
};

export const CommunityComposerDialog = ({
  isOpen,
  isSubmitting = false,
  initialPost = null,
  labels,
  onClose,
  onSubmit,
}: CommunityComposerDialogProps) => {
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [libraryAssets, setLibraryAssets] = React.useState<PickedLibraryAsset[]>([]);
  const [historyItems, setHistoryItems] = React.useState<ComposerHistoryItem[]>([]);
  const [shareSkill, setShareSkill] = React.useState(true);
  const [postTypeOverride, setPostTypeOverride] = React.useState<'' | CommunityPostType>('');
  const [isLibraryOpen, setIsLibraryOpen] = React.useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = React.useState(false);
  const [error, setError] = React.useState('');

  const reset = () => {
    setTitle('');
    setBody('');
    setLibraryAssets([]);
    setHistoryItems([]);
    setShareSkill(true);
    setPostTypeOverride('');
    setError('');
  };

  React.useEffect(() => {
    if (!isOpen) return;
    setError('');
    if (!initialPost) {
      reset();
      return;
    }
    setTitle(initialPost.title);
    setBody(initialPost.body);
    setPostTypeOverride(initialPost.post_type);
    setLibraryAssets([]);
    setHistoryItems(initialPost.media
      .filter((media) => media.kind === 'image' || media.kind === 'video')
      .map((media) => ({
        kind: media.kind as 'image' | 'video',
        url: media.url,
        name: initialPost.title,
        thumbnail_url: media.thumbnail_url,
        skill: initialPost.shared_skill || null,
      })));
    setShareSkill(Boolean(initialPost.shared_skill));
  }, [initialPost?.id, isOpen]);

  if (!isOpen) return null;

  const skillVideos = historyItems.filter((h) => h.kind === 'video' && h.skill && (h.skill.seed || h.skill.name));
  const hasSkill = skillVideos.length > 0;
  const anySkillLoading = historyItems.some((h) => h.kind === 'video' && h.skillLoading);
  const sharingSkill = hasSkill && shareSkill;
  const effectivePostType: CommunityPostType = postTypeOverride || (sharingSkill ? 'experience' : 'material_share');

  const handleLibraryConfirm = (assets: AssetLibraryPickedAsset<CommunityAssetTab>[]) => {
    setLibraryAssets((prev) => {
      const map = new Map(prev.map((a) => [a.id, a]));
      assets.forEach((a) => {
        map.set(a.id, { id: a.id, name: a.name, assetType: String(a.assetType), fileUrl: a.fileUrl, thumbnail: a.thumbnail });
      });
      return Array.from(map.values());
    });
    setIsLibraryOpen(false);
  };

  const handleHistoryConfirm = (picked: CommunityHistoryPicked[]) => {
    setHistoryItems((prev) => {
      const map = new Map(prev.map((it) => [`${it.kind}:${it.url}`, it]));
      picked.forEach((p) => {
        const k = `${p.kind}:${p.url}`;
        if (!map.has(k)) {
          map.set(k, { ...p, skill: null, skillLoading: p.kind === 'video' && Boolean(p.source_project_id) });
        }
      });
      return Array.from(map.values());
    });
    // 为历史视频回溯其创作 skill（用于「同时分享 skill」）
    picked
      .filter((p) => p.kind === 'video' && p.source_project_id)
      .forEach((p) => {
        void videoApi
          .getHistoryDetail(String(p.source_project_id))
          .then((detail) => {
            const rp: any = detail?.request_payload || {};
            const raw = rp.seed_skill || rp?.script_content?.seed_skill || rp?.seed_skill_data || null;
            const skill = raw && typeof raw === 'object' && (raw.seed || raw.name) ? (raw as CommunitySharedSkill) : null;
            setHistoryItems((prev) => prev.map((it) => (it.kind === 'video' && it.url === p.url ? { ...it, skill, skillLoading: false } : it)));
          })
          .catch(() => {
            setHistoryItems((prev) => prev.map((it) => (it.kind === 'video' && it.url === p.url ? { ...it, skillLoading: false } : it)));
          });
      });
    setIsHistoryOpen(false);
  };

  const removeLibrary = (id: string) => setLibraryAssets((prev) => prev.filter((a) => a.id !== id));
  const removeHistory = (url: string, kind: string) => setHistoryItems((prev) => prev.filter((it) => !(it.url === url && it.kind === kind)));

  const buildMedia = (): CommunityMediaRef[] => {
    const historyMedia: CommunityMediaRef[] = historyItems.map((it) => ({
      kind: it.kind,
      url: it.url,
      name: it.name,
      thumbnail_url: it.thumbnail_url,
      source_project_id: it.source_project_id,
    }));
    const libraryMedia: CommunityMediaRef[] = libraryAssets
      .map((a): CommunityMediaRef | null => {
        const kind = viewableKindOf(a.assetType);
        if (!kind) return null;
        return { kind, url: a.fileUrl, name: a.name, thumbnail_url: a.thumbnail, source_asset_id: a.id };
      })
      .filter((x): x is CommunityMediaRef => Boolean(x));
    return [...historyMedia, ...libraryMedia];
  };

  const submit = async () => {
    if (isSubmitting) return;
    const media = buildMedia();
    const materialAssetIds = libraryAssets.map((a) => a.id);
    if (media.length === 0 && materialAssetIds.length === 0 && !body.trim()) {
      setError('请至少从素材库或生成历史中选择内容，或填写正文');
      return;
    }
    setError('');
    try {
      await onSubmit?.({
        title: title.trim(),
        body: body.trim(),
        postType: postTypeOverride,
        media,
        materialAssetIds,
        sharedSkill: sharingSkill ? skillVideos[0].skill : null,
      });
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const close = () => {
    if (!isSubmitting) onClose();
  };

  const totalSelected = libraryAssets.length + historyItems.length;

  return (
    <div className="fixed inset-0 z-[121] flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm" onClick={close}>
      <section className="flex max-h-[86vh] w-full max-w-3xl flex-col rounded-lg border border-white/10 bg-zinc-950 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2">
            {([
              ['material_share', labels.materialType],
              ['experience', labels.experienceType],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                disabled={isSubmitting}
                onClick={() => setPostTypeOverride(value)}
                className={`h-9 rounded-lg px-3 text-xs font-bold transition disabled:opacity-50 ${effectivePostType === value ? 'bg-orange-500 text-white' : 'bg-white/5 text-zinc-300 hover:bg-white/10'}`}
              >
                {label}
              </button>
            ))}
            {postTypeOverride ? (
              <button type="button" onClick={() => setPostTypeOverride('')} className="text-[11px] font-bold text-zinc-500 underline hover:text-zinc-300">自动</button>
            ) : null}
          </div>
          <button type="button" title={labels.close} aria-label={labels.close} disabled={isSubmitting} onClick={close} className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white disabled:opacity-40">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-5 py-5 custom-scroll">
          <input
            value={title}
            disabled={isSubmitting}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={labels.titlePlaceholder}
            className="h-11 rounded-lg border border-white/10 bg-black/35 px-3 text-sm font-bold text-zinc-100 outline-none focus:border-orange-400/70 disabled:opacity-60"
          />
          <textarea
            value={body}
            disabled={isSubmitting}
            onChange={(event) => setBody(event.target.value)}
            placeholder={labels.bodyPlaceholder}
            className="min-h-28 resize-none rounded-lg border border-white/10 bg-black/35 px-3 py-3 text-sm leading-6 text-zinc-100 outline-none focus:border-orange-400/70 disabled:opacity-60"
          />

          {/* 素材来源：仅支持素材库 / 生成历史（不再本地上传） */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setIsLibraryOpen(true)}
              className="flex h-20 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/15 bg-white/[0.03] text-xs font-bold text-zinc-300 hover:border-orange-400/50 disabled:opacity-60"
            >
              <Library className="h-5 w-5" />
              从素材库选择
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setIsHistoryOpen(true)}
              className="flex h-20 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/15 bg-white/[0.03] text-xs font-bold text-zinc-300 hover:border-orange-400/50 disabled:opacity-60"
            >
              <ImageIcon className="h-5 w-5" />
              从生成历史选择
            </button>
          </div>

          {totalSelected > 0 ? (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {historyItems.map((it) => (
                <div key={`h-${it.kind}-${it.url}`} className="group relative aspect-square overflow-hidden rounded-lg border border-white/10 bg-black/40">
                  {it.kind === 'video' ? (
                    it.thumbnail_url ? <img src={it.thumbnail_url} alt={it.name} className="h-full w-full object-cover" /> : <video src={it.url} muted preload="metadata" className="h-full w-full object-cover" />
                  ) : (
                    <img src={it.url} alt={it.name} className="h-full w-full object-cover" />
                  )}
                  {it.kind === 'video' ? <Film className="absolute left-1 top-1 h-3.5 w-3.5 text-white drop-shadow" /> : null}
                  {it.skill ? <Sparkles className="absolute right-1 top-1 h-3.5 w-3.5 text-amber-300 drop-shadow" /> : null}
                  <button type="button" onClick={() => removeHistory(it.url, it.kind)} className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition group-hover:opacity-100">
                    <Trash2 className="h-4 w-4 text-red-300" />
                  </button>
                </div>
              ))}
              {libraryAssets.map((a) => (
                <div key={`l-${a.id}`} className="group relative aspect-square overflow-hidden rounded-lg border border-white/10 bg-black/40">
                  {a.thumbnail || viewableKindOf(a.assetType) === 'image' ? (
                    <img src={a.thumbnail || a.fileUrl} alt={a.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-zinc-400">{a.assetType}</div>
                  )}
                  <span className="absolute left-1 top-1 rounded bg-black/60 px-1 py-0.5 text-[9px] font-bold text-zinc-100">库</span>
                  <button type="button" onClick={() => removeLibrary(a.id)} className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition group-hover:opacity-100">
                    <Trash2 className="h-4 w-4 text-red-300" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {/* 分享 skill 选项：仅当选中的历史视频含可分享 skill 时出现，默认开启 */}
          {hasSkill ? (
            <label className="flex items-start gap-3 rounded-lg border border-amber-300/25 bg-amber-400/10 px-4 py-3">
              <input type="checkbox" checked={shareSkill} disabled={isSubmitting} onChange={(e) => setShareSkill(e.target.checked)} className="mt-0.5 h-4 w-4 accent-orange-500" />
              <span className="text-xs font-bold leading-5 text-amber-100">
                同时分享创作该视频的 Skill「{String(skillVideos[0].skill?.name || 'Skill')}」
                <span className="mt-0.5 block font-normal text-amber-200/80">开启后，Skill 将以文本形式展示在帖子中，其他用户可保存到素材库；分享 Skill 的帖子默认标记为「经验分享」。</span>
              </span>
            </label>
          ) : anySkillLoading ? (
            <div className="inline-flex items-center gap-2 text-xs font-bold text-zinc-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> 正在检测所选视频是否含可分享的 Skill...</div>
          ) : historyItems.some((h) => h.kind === 'video') ? (
            <div className="text-xs font-bold text-zinc-500">所选历史视频生成于 Skill 功能上线前，无可分享的 Skill。</div>
          ) : null}

          {error ? <div className="text-xs font-bold text-red-300">{error}</div> : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-4">
          <button type="button" disabled={isSubmitting} onClick={close} className="h-10 rounded-lg border border-white/10 px-4 text-sm font-bold text-zinc-300 hover:bg-white/10 disabled:opacity-50">
            {labels.cancel}
          </button>
          <button type="button" disabled={isSubmitting} onClick={() => void submit()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-orange-500 px-4 text-sm font-bold text-white hover:bg-orange-400 disabled:opacity-60">
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isSubmitting ? labels.submitting : labels.submit}
          </button>
        </div>
      </section>

      <AssetLibraryPickerDialog<CommunityAssetTab>
        isOpen={isLibraryOpen}
        tabs={COMMUNITY_ASSET_TABS}
        maxCount={12}
        appliedCount={libraryAssets.length}
        title={labels.assetPickerTitle}
        onConfirm={handleLibraryConfirm}
        onClose={() => setIsLibraryOpen(false)}
      />

      <CommunityHistoryPicker
        isOpen={isHistoryOpen}
        onConfirm={handleHistoryConfirm}
        onClose={() => setIsHistoryOpen(false)}
      />
    </div>
  );
};
