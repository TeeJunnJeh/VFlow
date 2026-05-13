export type GalleryBoardEditorShortcutAction = 'delete-selected' | 'undo' | 'redo';

export type GalleryBoardEditorShortcutEventLike = {
  key: string;
  targetTagName?: string;
  targetIsContentEditable?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
};

const EDITABLE_TAG_NAMES = new Set(['input', 'textarea', 'select']);

export const getGalleryBoardEditorShortcutAction = ({
  key,
  targetTagName,
  targetIsContentEditable,
  ctrlKey,
  metaKey,
  shiftKey,
}: GalleryBoardEditorShortcutEventLike): GalleryBoardEditorShortcutAction | null => {
  const tagName = String(targetTagName || '').toLowerCase();
  if (targetIsContentEditable || EDITABLE_TAG_NAMES.has(tagName)) return null;

  const normalizedKey = String(key || '').toLowerCase();
  const hasModifier = Boolean(ctrlKey || metaKey);

  if (!hasModifier && (normalizedKey === 'delete' || normalizedKey === 'backspace')) {
    return 'delete-selected';
  }

  if (!hasModifier) return null;
  if (normalizedKey === 'z' && shiftKey) return 'redo';
  if (normalizedKey === 'y') return 'redo';
  if (normalizedKey === 'z') return 'undo';

  return null;
};
