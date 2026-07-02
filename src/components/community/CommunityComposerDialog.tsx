import React from 'react';
import { ImagePlus, Loader2, Music, Video, X } from 'lucide-react';
import { AssetLibraryPickerDialog, type AssetLibraryPickedAsset, type AssetLibraryPickerTabConfig } from '../productImages/Common/AssetLibraryPickerDialog';
import { CommunityAssetPicker, type CommunitySelectedAsset } from './CommunityAssetPicker';
import type { CommunityCreateDraft, CommunityPostType } from '../../services/community';

type CommunityAssetTab = 'product' | 'motion' | 'audio' | 'script' | 'model' | 'scene';

const COMMUNITY_ASSET_TABS: AssetLibraryPickerTabConfig<CommunityAssetTab>[] = [
  { key: 'product', assetType: 'product', fallbackLabel: 'Images' },
  { key: 'motion', assetType: 'motion', fallbackLabel: 'Videos' },
  { key: 'audio', assetType: 'audio', fallbackLabel: 'Audio' },
  { key: 'script', assetType: 'script', fallbackLabel: 'Scripts' },
  { key: 'model', assetType: 'model', fallbackLabel: 'Models' },
  { key: 'scene', assetType: 'scene', fallbackLabel: 'Scenes' },
];

const COMMUNITY_ASSET_ACCEPTED_FORMATS = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'text/plain',
  'application/json',
];

interface CommunityComposerDialogProps {
  isOpen: boolean;
  isSubmitting?: boolean;
  labels: {
    close: string;
    cancel: string;
    submit: string;
    submitting: string;
    titlePlaceholder: string;
    bodyPlaceholder: string;
    videoRequired: string;
    materialType: string;
    experienceType: string;
    videoLabel: string;
    imagesLabel: string;
    audioLabel: string;
    assetsLabel: string;
    assetPickerTitle: string;
  };
  onClose: () => void;
  onSubmit?: (draft: CommunityCreateDraft) => void | Promise<void>;
}

export const CommunityComposerDialog = ({
  isOpen,
  isSubmitting = false,
  labels,
  onClose,
  onSubmit,
}: CommunityComposerDialogProps) => {
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [postType, setPostType] = React.useState<CommunityPostType>('material_share');
  const [video, setVideo] = React.useState<File | null>(null);
  const [images, setImages] = React.useState<File[]>([]);
  const [audio, setAudio] = React.useState<File | null>(null);
  const [selectedAssets, setSelectedAssets] = React.useState<CommunitySelectedAsset[]>([]);
  const [isAssetPickerOpen, setIsAssetPickerOpen] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!isOpen) return;
    setError('');
  }, [isOpen]);

  if (!isOpen) return null;

  const submit = async () => {
    if (isSubmitting) return;
    if (!video) {
      setError(labels.videoRequired);
      return;
    }
    setError('');
    try {
      await onSubmit?.({
        title: title.trim(),
        body: body.trim(),
        postType,
        video,
        images,
        audio,
        materialAssetIds: selectedAssets.map((asset) => asset.id),
      });
      setTitle('');
      setBody('');
      setPostType('material_share');
      setVideo(null);
      setImages([]);
      setAudio(null);
      setSelectedAssets([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const close = () => {
    if (!isSubmitting) onClose();
  };

  const handleAssetsConfirm = (assets: AssetLibraryPickedAsset<CommunityAssetTab>[]) => {
    setSelectedAssets((prev) => {
      const map = new Map(prev.map((asset) => [asset.id, asset]));
      assets.forEach((asset) => {
        map.set(asset.id, { id: asset.id, name: asset.name });
      });
      return Array.from(map.values());
    });
    setIsAssetPickerOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[121] flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm" onClick={close}>
      <section className="w-full max-w-3xl rounded-lg border border-white/10 bg-zinc-950 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex gap-2">
            {([
              ['material_share', labels.materialType],
              ['experience', labels.experienceType],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                disabled={isSubmitting}
                onClick={() => setPostType(value)}
                className={`h-9 rounded-lg px-3 text-xs font-bold transition disabled:opacity-50 ${postType === value ? 'bg-orange-500 text-white' : 'bg-white/5 text-zinc-300 hover:bg-white/10'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" title={labels.close} aria-label={labels.close} disabled={isSubmitting} onClick={close} className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white disabled:opacity-40">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-4 px-5 py-5">
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
            className="min-h-32 resize-none rounded-lg border border-white/10 bg-black/35 px-3 py-3 text-sm leading-6 text-zinc-100 outline-none focus:border-orange-400/70 disabled:opacity-60"
          />

          <div className="grid grid-cols-3 gap-3">
            <label className={`flex h-24 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 bg-white/[0.03] text-xs font-bold text-zinc-300 hover:border-orange-400/50 ${isSubmitting ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
              <Video className="h-5 w-5" />
              {video?.name || labels.videoLabel}
              <input type="file" accept="video/*" disabled={isSubmitting} className="hidden" onChange={(event) => setVideo(event.target.files?.[0] || null)} />
            </label>
            <label className={`flex h-24 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 bg-white/[0.03] text-xs font-bold text-zinc-300 hover:border-orange-400/50 ${isSubmitting ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
              <ImagePlus className="h-5 w-5" />
              {images.length ? `${images.length} ${labels.imagesLabel}` : labels.imagesLabel}
              <input type="file" accept="image/*" multiple disabled={isSubmitting} className="hidden" onChange={(event) => setImages(Array.from(event.target.files || []))} />
            </label>
            <label className={`flex h-24 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 bg-white/[0.03] text-xs font-bold text-zinc-300 hover:border-orange-400/50 ${isSubmitting ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
              <Music className="h-5 w-5" />
              {audio?.name || labels.audioLabel}
              <input type="file" accept="audio/*" disabled={isSubmitting} className="hidden" onChange={(event) => setAudio(event.target.files?.[0] || null)} />
            </label>
          </div>

          <CommunityAssetPicker
            selectedAssets={selectedAssets}
            disabled={isSubmitting}
            addLabel={labels.assetsLabel}
            onAdd={() => setIsAssetPickerOpen(true)}
            onRemove={(assetId) => setSelectedAssets((prev) => prev.filter((asset) => asset.id !== assetId))}
          />

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
        isOpen={isAssetPickerOpen}
        tabs={COMMUNITY_ASSET_TABS}
        maxCount={8}
        appliedCount={selectedAssets.length}
        maxFileSize={50 * 1024 * 1024}
        acceptedFormats={COMMUNITY_ASSET_ACCEPTED_FORMATS}
        uploadAccept=".jpg,.jpeg,.png,.webp,.mp4,.mov,.mp3,.wav,.txt,.md,.json"
        title={labels.assetPickerTitle}
        onConfirm={handleAssetsConfirm}
        onClose={() => setIsAssetPickerOpen(false)}
      />
    </div>
  );
};