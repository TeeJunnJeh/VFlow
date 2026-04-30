import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, Download, MoveDiagonal2, PanelRightClose, PanelRightOpen, Plus, RotateCcw, Sparkles, Trash2, Type, X, PencilLine } from 'lucide-react';
import PptxGenJS from 'pptxgenjs';
import { AppDialog } from '../common/AppDialog';
import { useLanguage } from '../../context/LanguageContext';
import type { translations } from '../../i18n/translations';
import {
  videoApi,
  type TextSeparationSecondaryCreatePayload,
  type TextSeparationSecondaryHistoryItem,
  type TextSeparationSecondaryResult,
  type TextSeparationSecondaryTask,
} from '../../services/video';

type I18nTranslations = typeof translations['en'];

export interface TextSeparationBlock {
  id: string;
  text: string;
  bbox: [number, number, number, number];
  font_size?: number;
  color?: [number, number, number];
  bold?: boolean;
  outline?: boolean | { color?: [number, number, number]; width?: number };
  shadow?: boolean | { color?: [number, number, number]; blur?: number; offsetX?: number; offsetY?: number };
}

interface TextElement {
  id: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSizePx: number;
  fontWeight: number;
  color: string;
  align: 'left' | 'center' | 'right';
  strokeColor: string;
  strokeWidth: number;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  prompt: string;
}

interface TextRepaintTaskItem extends TextSeparationSecondaryTask {
  createdAt: string;
  previewUrl?: string | null;
  error?: string;
  globalPrompt: string;
  sampleTitle: string;
  backgroundImageUrl: string;
  originalImageUrl: string;
  elementsSnapshot: TextElement[];
  canvasAspectRatio: number;
}

interface TextSeparationDemoViewProps {
  backgroundImageUrl: string;
  originalImageUrl: string;
  sampleTitle: string;
  textBlocks: TextSeparationBlock[];
  isZh: boolean;
  onBack: () => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const rgbArrayToHex = (color?: [number, number, number]) => {
  if (!color || color.length !== 3) return '#171717';
  return `#${color
    .map((channel) => clamp(Math.round(Number(channel) || 0), 0, 255).toString(16).padStart(2, '0'))
    .join('')}`;
};

const wrapTextByWidth = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  const rawLines = String(text || '').split(/\r?\n/);
  const wrapped: string[] = [];

  rawLines.forEach((line) => {
    const content = String(line || '');
    if (!content) {
      wrapped.push('');
      return;
    }

    let current = '';
    for (const char of content) {
      const next = current + char;
      if (ctx.measureText(next).width > maxWidth && current) {
        wrapped.push(current);
        current = char;
      } else {
        current = next;
      }
    }

    if (current) wrapped.push(current);
  });

  return wrapped;
};

const WEB_FONT_FAMILY =
  '"Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Source Han Sans SC", "Segoe UI", sans-serif';
const PPT_FONT_FACE_ZH = 'Microsoft YaHei';
const PPT_FONT_FACE_EN = 'Segoe UI';

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        resolve(result);
        return;
      }
      reject(new Error('Failed to convert blob to data URL'));
    };
    reader.onerror = () => reject(new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });

const hexToRgb = (hex: string) => {
  const normalized = String(hex || '').replace('#', '').trim();
  if (normalized.length !== 6) return '171717';
  return normalized.toUpperCase();
};

const resolveOutline = (outline: TextSeparationBlock['outline']) => {
  if (outline === false || outline == null) return { strokeColor: '#ffffff', strokeWidth: 0 };
  if (outline === true) return { strokeColor: '#ffffff', strokeWidth: 0.0025 };
  return {
    strokeColor: rgbArrayToHex(outline.color),
    strokeWidth: clamp(Number(outline.width) || 0.0025, 0.0005, 0.02),
  };
};

const resolveShadow = (shadow: TextSeparationBlock['shadow']) => {
  // Treat missing shadow (null/undefined) as no shadow by default.
  if (shadow === false || shadow == null) {
    return {
      shadowColor: '#000000',
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
    };
  }
  if (shadow === true) {
    return {
      shadowColor: '#000000',
      shadowBlur: 0.012,
      shadowOffsetX: 0,
      shadowOffsetY: 0.004,
    };
  }
  return {
    shadowColor: rgbArrayToHex(shadow.color),
    shadowBlur: clamp(Number(shadow.blur) || 0.012, 0, 0.08),
    shadowOffsetX: clamp(Number(shadow.offsetX) || 0, -0.05, 0.05),
    shadowOffsetY: clamp(Number(shadow.offsetY) || 0.004, -0.05, 0.05),
  };
};

const normalizeBlocks = (blocks: TextSeparationBlock[]): TextElement[] =>
  blocks.map((block) => {
    const [y0, x0, y1, x1] = block.bbox;
    const height = Math.max(0.04, (y1 - y0) / 1000);
    const fontSizeFromJson = Number(block.font_size);
    const outlineStyle = resolveOutline(block.outline);
    const shadowStyle = resolveShadow(block.shadow);
    return {
      id: block.id,
      text: String(block.text || '').replace(/u0026/g, '&'),
      x: x0 / 1000,
      y: y0 / 1000,
      w: Math.max(0.08, (x1 - x0) / 1000),
      h: Math.max(0.05, (y1 - y0) / 1000),
      fontSizePx: Number.isFinite(fontSizeFromJson)
        ? clamp(fontSizeFromJson, 6, 360)
        : clamp(Math.round(height * 1024), 10, 180),
      fontWeight: block.bold === false ? 400 : 700,
      color: rgbArrayToHex(block.color),
      align: 'center',
      strokeColor: outlineStyle.strokeColor,
      strokeWidth: outlineStyle.strokeWidth,
      shadowColor: shadowStyle.shadowColor,
      shadowBlur: shadowStyle.shadowBlur,
      shadowOffsetX: shadowStyle.shadowOffsetX,
      shadowOffsetY: shadowStyle.shadowOffsetY,
      prompt: '',
    };
  });

const createDefaultTextElement = (index: number): TextElement => ({
  id: `txt_${Date.now()}_${index}`,
  text: '新增文本',
  x: 0.12,
  y: 0.12,
  w: 0.32,
  h: 0.12,
  fontSizePx: 42,
  fontWeight: 700,
  color: '#171717',
  align: 'center',
  strokeColor: '#ffffff',
  strokeWidth: 0,
  shadowColor: '#000000',
  shadowBlur: 0.012,
  shadowOffsetX: 0,
  shadowOffsetY: 0.004,
  prompt: '',
});

const cloneElements = (items: TextElement[]) => items.map((item) => ({ ...item }));

const mapHistoryItemToTextRepaintTask = (item: TextSeparationSecondaryHistoryItem): TextRepaintTaskItem => ({
  history_id: item.history_id,
  request_id: item.request_id,
  status: item.status,
  createdAt: item.created_at,
  previewUrl: item.preview_url || null,
  error: item.error,
  globalPrompt: item.global_prompt || '',
  sampleTitle: item.sample_title || '',
  backgroundImageUrl: item.background_image_url || '',
  originalImageUrl: item.original_image_url || '',
  elementsSnapshot: Array.isArray(item.elements_snapshot) && item.elements_snapshot.length > 0
    ? (item.elements_snapshot as TextElement[]).map((element) => ({ ...element }))
    : Array.isArray(item.elements)
    ? item.elements.map((element, index) => ({
        id: element.id || `txt_${index + 1}`,
        text: element.text || '',
        x: (element.bbox?.[1] || 0) / 1000,
        y: (element.bbox?.[0] || 0) / 1000,
        w: Math.max(0.05, ((element.bbox?.[3] || 0) - (element.bbox?.[1] || 0)) / 1000),
        h: Math.max(0.05, ((element.bbox?.[2] || 0) - (element.bbox?.[0] || 0)) / 1000),
        fontSizePx: 42,
        fontWeight: 700,
        color: '#171717',
        align: 'center',
        strokeColor: '#ffffff',
        strokeWidth: 0,
        shadowColor: '#000000',
        shadowBlur: 0.012,
        shadowOffsetX: 0,
        shadowOffsetY: 0.004,
        prompt: element.prompt || '',
      }))
    : [],
  canvasAspectRatio: Number(item.canvas_aspect_ratio) || 1,
  get_url: null,
});

const mapCreateTaskToTextRepaintTask = (
  task: TextSeparationSecondaryTask,
  fallback: {
    sampleTitle: string;
    backgroundImageUrl: string;
    originalImageUrl: string;
    globalPrompt: string;
    elementsSnapshot: TextElement[];
    canvasAspectRatio: number;
  }
): TextRepaintTaskItem => ({
  history_id: task.history_id,
  request_id: task.request_id,
  status: task.status,
  createdAt: task.created_at || new Date().toISOString(),
  previewUrl: task.preview_url || null,
  error: task.error,
  globalPrompt: task.global_prompt || fallback.globalPrompt,
  sampleTitle: task.sample_title || fallback.sampleTitle,
  backgroundImageUrl: task.background_image_url || fallback.backgroundImageUrl,
  originalImageUrl: task.original_image_url || fallback.originalImageUrl,
  elementsSnapshot: Array.isArray(task.elements_snapshot) && task.elements_snapshot.length > 0
    ? (task.elements_snapshot as TextElement[]).map((element) => ({ ...element }))
    : fallback.elementsSnapshot,
  canvasAspectRatio: Number(task.canvas_aspect_ratio) || fallback.canvasAspectRatio,
  get_url: task.get_url,
});

const normalizeTaskImageKey = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const url = new URL(raw, window.location.origin);
    return `${url.origin}${url.pathname}`.toLowerCase();
  } catch {
    return raw.split('?')[0].split('#')[0].toLowerCase();
  }
};

const belongsToCurrentPoster = (
  task: TextRepaintTaskItem,
  currentBackgroundImageUrl: string,
  currentOriginalImageUrl: string
) => {
  const currentKeys = [currentBackgroundImageUrl, currentOriginalImageUrl]
    .map((item) => normalizeTaskImageKey(item))
    .filter(Boolean);

  if (currentKeys.length === 0) return true;

  const taskKeys = [task.backgroundImageUrl, task.originalImageUrl]
    .map((item) => normalizeTaskImageKey(item))
    .filter(Boolean);

  return taskKeys.some((item) => currentKeys.includes(item));
};

const sortTextRepaintTasks = (items: TextRepaintTaskItem[]) =>
  [...items].sort((a, b) => Number(new Date(b.createdAt)) - Number(new Date(a.createdAt)));

const formatTaskTimestamp = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '00000000_000000';

  const pad = (num: number) => String(num).padStart(2, '0');
  return [
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`,
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`,
  ].join('_');
};

const styles = {
  root: 'h-full flex flex-col gap-5',
  card: 'bg-transparent',
  toolbarCard: 'flex items-center justify-between gap-4 rounded-2xl border border-white/5 bg-white/2 px-5 py-4',
  sectionTitle: 'text-sm font-bold text-zinc-100',
  sectionHint: 'text-xs text-zinc-500',
  secondaryButton:
    'inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-bold text-zinc-200 hover:bg-white/5 transition',
  dangerButton:
    'inline-flex items-center gap-2 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-200 hover:bg-red-500/20 transition',
  primaryButton:
    'inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-xs font-bold text-black hover:bg-orange-400 transition',
  primaryWideButton:
    'inline-flex w-full items-center justify-center gap-2 rounded-lg border border-orange-500/40 bg-orange-500/10 px-4 py-3 text-sm font-bold text-orange-200 hover:bg-orange-500/20 disabled:border-white/10 disabled:bg-black/30 disabled:text-zinc-500 disabled:hover:bg-black/30 transition',
    menuButton:
      'flex w-full items-center px-3 py-2 text-left text-xs font-bold text-zinc-200 hover:bg-white/10 disabled:opacity-60 transition',
  drawerToggle:
    'inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-black/20 text-zinc-200 hover:bg-white/5 transition',
  input:
    'w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-orange-500/60',
  textarea:
    'w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-zinc-100 outline-none focus:border-orange-500/60',
  sectionLabel: 'mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500',
  valueCard: 'rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-300',
  colorControl: 'flex items-center gap-3',
  colorInput: 'absolute inset-0 h-full w-full cursor-pointer opacity-0',
  colorTextInput:
    'flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-mono text-zinc-200 outline-none focus:border-orange-500/60',
  rangeInput: 'w-full accent-orange-500',
  optionButton:
    'rounded-xl border px-3 py-2 text-xs font-bold transition',
  emptyState:
    'rounded-xl border border-dashed border-white/10 bg-black/10 px-4 py-6 text-sm text-zinc-500',
  panelPadding: 'p-4',
    taskCard: 'overflow-hidden rounded-2xl border border-white/10 bg-black/20',
  previewFrame: 'rounded-2xl border border-white/10 bg-black/20 p-3',
    previewCardButton:
      'block w-full text-left transition disabled:cursor-default disabled:opacity-100',
    applyAccentButton:
      'inline-flex items-center justify-center gap-2 rounded-lg border border-orange-500/40 bg-orange-500/10 px-4 py-3 text-sm font-bold text-orange-200 hover:bg-orange-500/20 transition',
    actionSecondaryButton:
      'inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-zinc-200 transition-all hover:!border-orange-400 hover:!bg-orange-500/10 hover:!text-orange-200 disabled:opacity-50',
  } as const;

const getTextRepaintTaskTitle = (task: TextRepaintTaskItem, t: I18nTranslations) =>
  `${t.tsep_task_title_prefix}_${formatTaskTimestamp(task.createdAt)}`;

interface ExportMenuProps {
  isOpen: boolean;
  isExporting: boolean;
  isExportingPptx: boolean;
  t: I18nTranslations;
  onToggle: () => void;
  onExportJson: () => void;
  onExportPptx: () => Promise<void>;
  onExportPng: () => Promise<void>;
}

const ExportMenu: React.FC<ExportMenuProps> = ({
  isOpen,
  isExporting,
  isExportingPptx,
  t,
  onToggle,
  onExportJson,
  onExportPptx,
  onExportPng,
}) => (
  <div className="relative">
    <button type="button" onClick={onToggle} className={styles.primaryButton}>
      <Download className="w-4 h-4" />
      {t.pg_board_export}
      <ChevronDown className={`h-4 w-4 transition ${isOpen ? 'rotate-180' : ''}`} />
    </button>
    {isOpen ? (
        <div className="absolute right-0 z-20 mt-2 w-32 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/95 py-1 shadow-2xl backdrop-blur">
          <button type="button" onClick={onExportJson} className={styles.menuButton}>
            {t.tsep_export_text_json}
          </button>
        <button type="button" onClick={() => void onExportPptx()} disabled={isExportingPptx} className={styles.menuButton}>
          {isExportingPptx ? t.tsep_exporting_pptx : t.tsep_export_pptx}
        </button>
        <button type="button" onClick={() => void onExportPng()} disabled={isExporting} className={styles.menuButton}>
          {isExporting ? t.tsep_exporting_png : t.tsep_export_png}
        </button>
      </div>
    ) : null}
  </div>
);

interface TextElementBoxProps {
  item: TextElement;
  isSelected: boolean;
  sampleTitle: string;
  surfaceViewportWidth: number;
  imageWidth: number;
  surfaceBaseSize: number;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onStartDrag: (id: string, e: React.PointerEvent<HTMLDivElement>) => void;
  onStartResize: (id: string, e: React.PointerEvent<HTMLButtonElement>) => void;
  t: I18nTranslations;
}

const TextElementBox: React.FC<TextElementBoxProps> = ({
  item,
  isSelected,
  surfaceViewportWidth,
  imageWidth,
  surfaceBaseSize,
  onSelect,
  onDelete,
  onStartDrag,
  onStartResize,
  t,
}) => {
  const fontSizePx = Math.max(12, Math.round(item.fontSizePx * (surfaceViewportWidth / imageWidth)));

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(item.id)}
      onPointerDown={(e) => onStartDrag(item.id, e)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(item.id);
        }
      }}
      className={`absolute rounded-lg border px-2 py-1 transition ${
        isSelected ? 'border-orange-400 ring-2 ring-orange-500/60' : 'border-white/20 hover:border-white/40'
      }`}
      style={{
        left: `${item.x * 100}%`,
        top: `${item.y * 100}%`,
        width: `${item.w * 100}%`,
        minHeight: `${item.h * 100}%`,
      }}
    >
      <div
        className="w-full h-full break-words whitespace-pre-wrap leading-tight pointer-events-none"
        style={{
          color: item.color,
          fontSize: `${fontSizePx}px`,
          fontWeight: item.fontWeight,
          fontFamily: WEB_FONT_FAMILY,
          textAlign: item.align,
          WebkitTextStroke: item.strokeWidth > 0 ? `${Math.max(1, item.strokeWidth * surfaceBaseSize)}px ${item.strokeColor}` : undefined,
          textShadow:
            item.shadowBlur > 0
              ? `${Math.round(item.shadowOffsetX * surfaceBaseSize)}px ${Math.round(item.shadowOffsetY * surfaceBaseSize)}px ${Math.max(
                  1,
                  Math.round(item.shadowBlur * surfaceBaseSize)
                )}px ${item.shadowColor}`
              : undefined,
        }}
      >
        {item.text}
      </div>
      {isSelected ? (
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete(item.id);
          }}
          className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full border border-red-300 bg-red-500 text-white shadow"
          aria-label={t.tsep_delete_text_box}
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
      {isSelected ? (
        <button
          type="button"
          onPointerDown={(e) => onStartResize(item.id, e)}
          className="absolute -bottom-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full border border-orange-300 bg-orange-500 text-black shadow"
          aria-label={t.tsep_resize_text_box}
        >
          <MoveDiagonal2 className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
};

interface CanvasPanelProps {
  t: I18nTranslations;
  backgroundImageUrl: string;
  sampleTitle: string;
  elements: TextElement[];
  selectedId: string | null;
  imageSize: { width: number; height: number };
  surfaceViewport: { width: number; height: number };
  surfaceBaseSize: number;
  surfaceRef: React.RefObject<HTMLDivElement | null>;
  surfaceViewportRef: React.RefObject<HTMLDivElement | null>;
  onSelect: (id: string) => void;
  onAddTextElement: () => void;
  onDeleteElement: (id: string) => void;
  onStartDrag: (id: string, e: React.PointerEvent<HTMLDivElement>) => void;
  onStartResize: (id: string, e: React.PointerEvent<HTMLButtonElement>) => void;
  isExporting: boolean;
  isExportingPptx: boolean;
  isExportMenuOpen: boolean;
  onReset: () => void;
  onToggleExportMenu: () => void;
  onExportJson: () => void;
  onExportPptx: () => Promise<void>;
  onExportPng: () => Promise<void>;
}

const CanvasPanel: React.FC<CanvasPanelProps> = ({
  t,
  backgroundImageUrl,
  sampleTitle,
  elements,
  selectedId,
  imageSize,
  surfaceViewport,
  surfaceBaseSize,
  surfaceRef,
  surfaceViewportRef,
  onSelect,
  onAddTextElement,
  onDeleteElement,
  onStartDrag,
  onStartResize,
  isExporting,
  isExportingPptx,
  isExportMenuOpen,
  onReset,
  onToggleExportMenu,
  onExportJson,
  onExportPptx,
  onExportPng,
  }) => (
    <div className="min-w-0 flex-1 self-start flex flex-col">
      <div className="mb-3 flex items-start justify-between gap-3 px-1 py-1">
        <div className="min-w-0 flex items-center gap-2">
          <PencilLine className="h-4 w-4 text-orange-300" />
          <div className={styles.sectionTitle}>{t.tsep_editor_canvas}</div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={onReset} className={styles.secondaryButton}>
          <RotateCcw className="w-4 h-4" />
          {t.tsep_reset_layout}
        </button>
        <ExportMenu
          isOpen={isExportMenuOpen}
          isExporting={isExporting}
          isExportingPptx={isExportingPptx}
          t={t}
          onToggle={onToggleExportMenu}
          onExportJson={onExportJson}
          onExportPptx={onExportPptx}
          onExportPng={onExportPng}
        />
        <button type="button" onClick={onAddTextElement} className={styles.secondaryButton}>
          <Plus className="h-4 w-4" />
          {t.tsep_add_text_box}
        </button>
      </div>
    </div>

    <div className="flex-1 min-h-0 overflow-auto">
      <div ref={surfaceViewportRef} className="h-full w-full">
        <div className="flex w-full items-start justify-center">
          <div
            ref={surfaceRef}
            className="relative shrink-0 overflow-hidden bg-transparent"
            style={{
              width: `${surfaceViewport.width}px`,
              height: `${surfaceViewport.height}px`,
            }}
          >
            <img src={backgroundImageUrl} alt={sampleTitle} className="absolute inset-0 h-full w-full object-cover select-none pointer-events-none" />
            {elements.map((item) => (
              <TextElementBox
                key={item.id}
                item={item}
                isSelected={selectedId === item.id}
                sampleTitle={sampleTitle}
                surfaceViewportWidth={surfaceViewport.width}
                imageWidth={imageSize.width}
                surfaceBaseSize={surfaceBaseSize}
                onSelect={onSelect}
                onDelete={onDeleteElement}
                onStartDrag={onStartDrag}
                onStartResize={onStartResize}
                t={t}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);

interface SettingsPanelProps {
  t: I18nTranslations;
  selectedElement: TextElement | null;
  textRepaintGlobalPrompt: string;
  originalImageUrl: string;
  isTextRepaintSubmitting: boolean;
  onGlobalPromptChange: (value: string) => void;
  onStartTextRepaint: () => void;
  onUpdateElement: (id: string, patch: Partial<TextElement>) => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  t,
  selectedElement,
  textRepaintGlobalPrompt,
  originalImageUrl,
  isTextRepaintSubmitting,
  onGlobalPromptChange,
  onStartTextRepaint,
  onUpdateElement,
}) => (
  <div className="min-h-0 w-[320px] self-stretch flex flex-col gap-5">
    <div className={`${styles.card} ${styles.panelPadding}`}>
      <div className="flex items-center gap-2 text-sm font-bold text-zinc-100">
        <Sparkles className="w-4 h-4 text-orange-300" />
        {t.tsep_global_prompt_title}
      </div>
      <div className="mt-4 space-y-4">
        <textarea
          value={textRepaintGlobalPrompt}
          onChange={(e) => onGlobalPromptChange(e.target.value)}
          placeholder={t.tsep_global_prompt_placeholder}
          className={`${styles.textarea} min-h-[120px]`}
        />
        <button type="button" onClick={onStartTextRepaint} disabled={isTextRepaintSubmitting} className={styles.primaryWideButton}>
          <Sparkles className="h-4 w-4" />
          {isTextRepaintSubmitting ? t.tsep_text_repaint_submitting : t.tsep_text_repaint_action}
        </button>
      </div>
    </div>

    <div className={`${styles.card} ${styles.panelPadding}`}>
      <div className="flex items-center gap-2 text-sm font-bold text-zinc-100">
        <Type className="w-4 h-4 text-orange-300" />
        {t.tsep_text_settings_title}
      </div>
      <div className="mt-4 space-y-4">
        {selectedElement ? (
          <>
            <div>
              <div className={styles.sectionLabel}>{t.tsep_text_content_label}</div>
              <textarea
                value={selectedElement.text}
                onChange={(e) => onUpdateElement(selectedElement.id, { text: e.target.value })}
                className={`${styles.textarea} min-h-[110px]`}
              />
            </div>

            <div>
              <div className={styles.sectionLabel}>{t.tsep_selected_prompt_label}</div>
              <textarea
                value={selectedElement.prompt}
                onChange={(e) => onUpdateElement(selectedElement.id, { prompt: e.target.value })}
                placeholder={t.tsep_selected_prompt_placeholder}
                className={`${styles.textarea} min-h-[110px]`}
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                <span>{t.tsep_font_size}</span>
                <span>{Math.round(selectedElement.fontSizePx)} px</span>
              </div>
              <input
                type="range"
                min="6"
                max="240"
                value={Math.round(selectedElement.fontSizePx)}
                onChange={(e) => onUpdateElement(selectedElement.id, { fontSizePx: Number(e.target.value) })}
                className={styles.rangeInput}
              />
            </div>

            <div>
              <div className={styles.sectionLabel}>{t.tsep_font_weight}</div>
              <div className="grid grid-cols-2 gap-2">
                {([
                  [400, t.tsep_weight_regular],
                  [700, t.tsep_weight_bold],
                ] as Array<[number, string]>).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onUpdateElement(selectedElement.id, { fontWeight: value })}
                    className={`${styles.optionButton} ${
                      selectedElement.fontWeight === value ? 'border-orange-500 bg-orange-500/10 text-orange-300' : 'border-white/10 bg-black/20 text-zinc-300 hover:bg-white/5'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {[
              {
                label: t.tsep_color_text,
                value: selectedElement.color,
                onChange: (value: string) => onUpdateElement(selectedElement.id, { color: value }),
              },
              {
                label: t.tsep_color_stroke,
                value: selectedElement.strokeColor,
                onChange: (value: string) => onUpdateElement(selectedElement.id, { strokeColor: value }),
              },
              {
                label: t.tsep_color_shadow,
                value: selectedElement.shadowColor,
                onChange: (value: string) => onUpdateElement(selectedElement.id, { shadowColor: value }),
              },
            ].map((field) => (
              <div key={field.label}>
                  <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">{field.label}</div>
                  <div className={styles.colorControl}>
                    <label className="relative block h-9 w-9 cursor-pointer">
                      <span className="block h-9 w-9 rounded-full border border-white/10" style={{ backgroundColor: field.value }} />
                      <input type="color" value={field.value} onChange={(e) => field.onChange(e.target.value)} className={styles.colorInput} />
                    </label>
                    <input value={field.value} onChange={(e) => field.onChange(e.target.value)} className={styles.colorTextInput} />
                  </div>
                </div>
              ))}

            <div>
              <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                <span>{t.tsep_stroke_width}</span>
                <span>{Math.round(selectedElement.strokeWidth * 1000)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="20"
                value={Math.round(selectedElement.strokeWidth * 1000)}
                onChange={(e) => onUpdateElement(selectedElement.id, { strokeWidth: Number(e.target.value) / 1000 })}
                className={styles.rangeInput}
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                <span>{t.tsep_shadow_blur}</span>
                <span>{Math.round(selectedElement.shadowBlur * 1000)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="40"
                value={Math.round(selectedElement.shadowBlur * 1000)}
                onChange={(e) => onUpdateElement(selectedElement.id, { shadowBlur: Number(e.target.value) / 1000 })}
                className={styles.rangeInput}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                {
                  label: t.tsep_shadow_x,
                  value: selectedElement.shadowOffsetX,
                  onChange: (value: number) => onUpdateElement(selectedElement.id, { shadowOffsetX: value }),
                },
                {
                  label: t.tsep_shadow_y,
                  value: selectedElement.shadowOffsetY,
                  onChange: (value: number) => onUpdateElement(selectedElement.id, { shadowOffsetY: value }),
                },
              ].map((field) => (
                <div key={field.label}>
                  <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                    <span>{field.label}</span>
                    <span>{Math.round(field.value * 1000)}</span>
                  </div>
                  <input
                    type="range"
                    min="-30"
                    max="30"
                    value={Math.round(field.value * 1000)}
                    onChange={(e) => field.onChange(Number(e.target.value) / 1000)}
                    className={styles.rangeInput}
                  />
                </div>
              ))}
            </div>

            <div>
              <div className={styles.sectionLabel}>{t.tsep_align}</div>
              <div className="grid grid-cols-3 gap-2">
                {([
                  ['left', t.tsep_align_left],
                  ['center', t.tsep_align_center],
                  ['right', t.tsep_align_right],
                ] as Array<[TextElement['align'], string]>).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onUpdateElement(selectedElement.id, { align: value })}
                    className={`${styles.optionButton} ${
                      selectedElement.align === value ? 'border-orange-500 bg-orange-500/10 text-orange-300' : 'border-white/10 bg-black/20 text-zinc-300 hover:bg-white/5'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className={styles.emptyState}>
            {t.tsep_select_textbox_hint}
          </div>
        )}
      </div>
      </div>

      <div className={`${styles.card} ${styles.panelPadding}`}>
        <div className={styles.sectionTitle}>{t.tsep_original_reference}</div>
        <img src={originalImageUrl} alt={t.tsep_original_poster_alt} className="mt-3 block w-full h-auto max-h-[360px] object-contain rounded-xl" />
      </div>
  </div>
);

interface TaskDrawerProps {
  t: I18nTranslations;
  isOpen: boolean;
  isZh: boolean;
  imageAspectRatio: number;
  tasks: TextRepaintTaskItem[];
  onToggle: () => void;
  onPreview: (task: TextRepaintTaskItem) => void;
  onApply: (task: TextRepaintTaskItem) => void;
  onDownload: (task: TextRepaintTaskItem) => void;
}

const TaskDrawer: React.FC<TaskDrawerProps> = ({ t, isOpen, isZh, imageAspectRatio, tasks, onToggle, onPreview, onApply, onDownload }) => (
  <div className={`min-h-0 self-stretch shrink-0 overflow-hidden rounded-2xl border border-white/5 bg-white/2 transition-all duration-200 ${isOpen ? 'w-[360px]' : 'w-[56px]'}`}>
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-3">
        {isOpen ? (
          <div className="flex items-center gap-2 text-sm font-bold text-zinc-100">
              <Sparkles className="h-4 w-4 text-orange-300" />
              {t.tsep_text_repaint_tasks}
          </div>
        ) : null}
        <button
          type="button"
          onClick={onToggle}
          className={styles.drawerToggle}
          aria-label={isOpen ? t.tsep_drawer_collapse : t.tsep_drawer_expand}
        >
          {isOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
        </button>
      </div>

      {isOpen ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {tasks.length > 0 ? (
            <div className="space-y-3">
                {tasks.map((task) => {
                  const lowerStatus = String(task.status || '').toLowerCase();
                  const taskTitle = getTextRepaintTaskTitle(task, t);
                  return (
                    <div key={task.request_id} className={styles.taskCard}>
                      <button
                        type="button"
                        onClick={() => task.previewUrl && onPreview(task)}
                        disabled={!task.previewUrl}
                        className={styles.previewCardButton}
                        aria-label={t.tsep_open_preview}
                      >
                        <div className="overflow-hidden rounded-t-xl border border-white/10 bg-black/30" style={{ aspectRatio: `${task.canvasAspectRatio || imageAspectRatio}` }}>
                          {task.previewUrl ? (
                            <img src={task.previewUrl} alt={taskTitle} className="h-full w-full object-contain" />
                        ) : (
                          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-zinc-500">
                            {lowerStatus === 'failed' || lowerStatus === 'error'
                              ? task.error || t.tsep_generation_failed
                              : t.tsep_waiting_preview}
                          </div>
                          )}
                        </div>
                      </button>
                      <div className="space-y-3 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold text-zinc-200">{taskTitle}</div>
                            <div className="mt-1 text-[11px] text-zinc-500">{new Date(task.createdAt).toLocaleString(isZh ? 'zh-CN' : 'en-US', { hour12: false })}</div>
                          </div>
                          <div
                            className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                              lowerStatus === 'succeeded' || lowerStatus === 'completed'
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : lowerStatus === 'failed' || lowerStatus === 'error'
                                  ? 'bg-red-500/15 text-red-300'
                                  : 'bg-orange-500/15 text-orange-200'
                            }`}
                          >
                            {task.status}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => onDownload(task)}
                          disabled={!task.previewUrl}
                          className={`${styles.actionSecondaryButton} w-full`}
                        >
                          <Download className="h-4 w-4" />
                          {t.pi_gallery_preview_download_image}
                        </button>
                        <button
                          type="button"
                          onClick={() => onApply(task)}
                          className={`${styles.applyAccentButton} w-full`}
                        >
                          {t.tsep_apply_to_editor}
                        </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className={styles.emptyState}>
              {t.tsep_tasks_empty}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center px-2 py-4">
          <div style={{ writingMode: 'vertical-rl' }} className="rotate-180 text-[11px] font-bold tracking-[0.2em] text-zinc-500">
            {t.tsep_text_repaint_tasks}
          </div>
        </div>
      )}
    </div>
  </div>
);

interface PreviewDialogProps {
  t: I18nTranslations;
  previewTask: TextRepaintTaskItem | null;
  onClose: () => void;
  onApplyAndClose: (task: TextRepaintTaskItem) => void;
  onDownload: (task: TextRepaintTaskItem) => void;
}

const PreviewDialog: React.FC<PreviewDialogProps> = ({ t, previewTask, onClose, onApplyAndClose, onDownload }) => (
  <AppDialog
    isOpen={Boolean(previewTask?.previewUrl)}
    onClose={onClose}
    title={t.tsep_preview_title}
    subtitle={previewTask?.request_id || ''}
    widthClassName="max-w-5xl"
    contentClassName="overflow-auto"
  >
    {previewTask?.previewUrl ? (
      <div className="space-y-4">
        <div className={styles.previewFrame}>
          <img src={previewTask.previewUrl} alt={previewTask.request_id} className="block max-h-[75vh] w-full object-contain rounded-xl" />
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-300">
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">{t.tsep_task_configuration}</div>
          <div className="mt-3 space-y-2">
            {previewTask.sampleTitle ? (
              <div>{t.tsep_task_source.replace('{source}', previewTask.sampleTitle)}</div>
            ) : null}
            <div>{t.tsep_task_global_prompt.replace('{prompt}', previewTask.globalPrompt || t.tsep_empty_value)}</div>
            <div>{t.tsep_task_text_blocks_count.replace('{count}', String(previewTask.elementsSnapshot.length))}</div>
            <div>
              {t.tsep_task_local_prompts_count.replace(
                '{count}',
                String(previewTask.elementsSnapshot.filter((item) => String(item.prompt || '').trim()).length)
              )}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => onDownload(previewTask)} className={`${styles.actionSecondaryButton} w-full`}>
            <Download className="h-4 w-4" />
            {t.pi_gallery_preview_download_image}
          </button>
          <button type="button" onClick={() => onApplyAndClose(previewTask)} className={`${styles.applyAccentButton} w-full`}>
            {t.tsep_apply_to_editor}
          </button>
        </div>
      </div>
    ) : null}
  </AppDialog>
);

const TextSeparationDemoView: React.FC<TextSeparationDemoViewProps> = ({
  backgroundImageUrl,
  originalImageUrl,
  sampleTitle,
  textBlocks,
  isZh,
  onBack,
}) => {
  const { t } = useLanguage();
  const initialElements = useMemo(() => normalizeBlocks(textBlocks), [textBlocks]);
  const [elements, setElements] = useState<TextElement[]>(initialElements);
  const [selectedId, setSelectedId] = useState<string | null>(initialElements[0]?.id || null);
  const [textRepaintGlobalPrompt, setTextRepaintGlobalPrompt] = useState('');
  const [textRepaintTasks, setTextRepaintTasks] = useState<TextRepaintTaskItem[]>([]);
  const [previewTask, setPreviewTask] = useState<TextRepaintTaskItem | null>(null);
  const [isTextRepaintSubmitting, setIsTextRepaintSubmitting] = useState(false);
  const [isTaskDrawerOpen, setIsTaskDrawerOpen] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingPptx, setIsExportingPptx] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [imageSize, setImageSize] = useState<{ width: number; height: number }>({ width: 1, height: 1 });
  const [surfaceViewport, setSurfaceViewport] = useState<{ width: number; height: number }>({ width: 560, height: 560 });
  const surfaceViewportRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [surfaceBaseSize, setSurfaceBaseSize] = useState(560);
  const dragRef = useRef<{
    id: string;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
  } | null>(null);
  const resizeRef = useRef<{
    id: string;
    startClientX: number;
    startClientY: number;
    startW: number;
    startH: number;
  } | null>(null);

  useEffect(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setElements(initialElements);
      setSelectedId(initialElements[0]?.id || null);
      return;
    }

    const adjustedElements = initialElements.map((item) => {
      const normalizedText = String(item.text || '').replace(/\s+/g, ' ').trim() || ' ';
      const fontSize = Math.max(1, item.fontSizePx);
      ctx.font = `${item.fontWeight} ${fontSize}px ${WEB_FONT_FAMILY}`;
      const requiredPx = ctx.measureText(normalizedText).width + Math.max(10, fontSize * 0.7);
      const requiredW = clamp(requiredPx / Math.max(1, imageSize.width || 1), 0.06, 1);

      if (item.w >= requiredW) return item;

      const centerX = item.x + item.w / 2;
      let nextX = centerX - requiredW / 2;
      let nextW = requiredW;

      if (nextX < 0) {
        nextX = 0;
      }

      if (nextX + nextW > 1) {
        nextX = Math.max(0, 1 - nextW);
      }

      nextW = Math.min(nextW, 1 - nextX);
      return { ...item, x: nextX, w: nextW };
    });

    setElements(adjustedElements);
    setSelectedId(initialElements[0]?.id || null);
  }, [initialElements, imageSize.width]);

  useEffect(() => {
    setTextRepaintGlobalPrompt('');
    setPreviewTask(null);
  }, [initialElements]);

  useEffect(() => {
    setIsExportMenuOpen(false);
  }, [elements, selectedId]);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const items = await videoApi.textSeparationSecondaryHistory();
        setTextRepaintTasks(
          sortTextRepaintTasks(
            items
              .map(mapHistoryItemToTextRepaintTask)
              .filter((item) => belongsToCurrentPoster(item, backgroundImageUrl, originalImageUrl))
          )
        );
      } catch {
        setTextRepaintTasks([]);
      }
    };
    void loadHistory();
  }, [backgroundImageUrl, originalImageUrl]);

  useEffect(() => {
    const pendingTasks = textRepaintTasks.filter((item) => !['succeeded', 'completed', 'failed', 'error'].includes(String(item.status || '').toLowerCase()));
    if (pendingTasks.length === 0) return;

    const timer = window.setInterval(async () => {
      for (const task of pendingTasks) {
        try {
          const result: TextSeparationSecondaryResult = await videoApi.textSeparationSecondaryResult(task.request_id);
          setTextRepaintTasks((prev) =>
            prev.map((item) =>
              item.request_id === task.request_id
                ? {
                    ...item,
                    status: result.status,
                    previewUrl: result.outputs?.[0] || item.previewUrl || null,
                    error: result.error || item.error,
                  }
                : item
            )
          );
          if (['succeeded', 'completed', 'failed', 'error'].includes(String(result.status || '').toLowerCase())) {
            const items = await videoApi.textSeparationSecondaryHistory();
            setTextRepaintTasks(
              sortTextRepaintTasks(
                items
                  .map(mapHistoryItemToTextRepaintTask)
                  .filter((item) => belongsToCurrentPoster(item, backgroundImageUrl, originalImageUrl))
              )
            );
          }
        } catch (error) {
          setTextRepaintTasks((prev) =>
            prev.map((item) =>
              item.request_id === task.request_id
                ? {
                    ...item,
                    status: 'failed',
                    error: error instanceof Error ? error.message : t.tsep_error_query_task,
                  }
                : item
            )
          );
        }
      }
    }, 3000);

    return () => window.clearInterval(timer);
  }, [textRepaintTasks, isZh, backgroundImageUrl, originalImageUrl, t.tsep_error_query_task]);

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      setImageSize({
        width: Math.max(1, image.naturalWidth || image.width || 1),
        height: Math.max(1, image.naturalHeight || image.height || 1),
      });
    };
    image.src = backgroundImageUrl;
  }, [backgroundImageUrl]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    const updateSize = () => {
      const rect = surface.getBoundingClientRect();
      const nextBase = Math.max(320, Math.min(rect.width || 560, rect.height || 560));
      setSurfaceBaseSize(nextBase);
    };

    updateSize();
    const observer = new ResizeObserver(() => updateSize());
    observer.observe(surface);
    window.addEventListener('resize', updateSize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  useEffect(() => {
    const viewport = surfaceViewportRef.current;
    if (!viewport) return;

    const updateViewport = () => {
      const rect = viewport.getBoundingClientRect();
      const availableWidth = Math.max(1, rect.width);
      const ratio = imageSize.width / imageSize.height;
      const nextWidth = availableWidth;
      const nextHeight = nextWidth / ratio;

      setSurfaceViewport({
        width: Math.max(1, nextWidth),
        height: Math.max(1, nextHeight),
      });
    };

    updateViewport();
    const observer = new ResizeObserver(() => updateViewport());
    observer.observe(viewport);
    window.addEventListener('resize', updateViewport);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateViewport);
    };
  }, [imageSize.width, imageSize.height]);

  const selectedElement = useMemo(
    () => elements.find((item) => item.id === selectedId) || null,
    [elements, selectedId]
  );

  const updateElement = (id: string, patch: Partial<TextElement>) => {
    setElements((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const addTextElement = () => {
    const next = createDefaultTextElement(elements.length + 1);
    setElements((prev) => [...prev, next]);
    setSelectedId(next.id);
  };

  const deleteSelectedElement = () => {
    if (!selectedElement) return;
    setElements((prev) => {
      const filtered = prev.filter((item) => item.id !== selectedElement.id);
      setSelectedId(filtered[0]?.id || null);
      return filtered;
    });
  };

  const fitAllTextBoxesToSingleLine = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setElements((prev) =>
      prev.map((item) => {
        const normalizedText = String(item.text || '').replace(/\s+/g, ' ').trim() || ' ';
        const fontSize = Math.max(1, item.fontSizePx);
        ctx.font = `${item.fontWeight} ${fontSize}px ${WEB_FONT_FAMILY}`;
        const requiredPx = ctx.measureText(normalizedText).width + Math.max(10, fontSize * 0.7);
        const requiredW = clamp(requiredPx / Math.max(1, imageSize.width), 0.06, 1);

        if (item.w >= requiredW) return item;

        const centerX = item.x + item.w / 2;
        let nextX = centerX - requiredW / 2;
        let nextW = requiredW;

        if (nextX < 0) {
          nextX = 0;
        }

        if (nextX + nextW > 1) {
          nextX = Math.max(0, 1 - nextW);
        }

        nextW = Math.min(nextW, 1 - nextX);
        return { ...item, x: nextX, w: nextW };
      })
    );
  };

  const startDrag = (id: string, e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const current = elements.find((item) => item.id === id);
    const surface = surfaceRef.current;
    if (!current || !surface) return;

    const bounds = surface.getBoundingClientRect();
    dragRef.current = {
      id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: current.x,
      startY: current.y,
    };

    const onMove = (ev: PointerEvent) => {
      const drag = dragRef.current;
      const activeSurface = surfaceRef.current;
      if (!drag || !activeSurface) return;
      const rect = activeSurface.getBoundingClientRect();
      const dx = rect.width > 0 ? (ev.clientX - drag.startClientX) / rect.width : 0;
      const dy = rect.height > 0 ? (ev.clientY - drag.startClientY) / rect.height : 0;

      setElements((prev) =>
        prev.map((item) =>
          item.id === drag.id
            ? {
                ...item,
                x: clamp(drag.startX + dx, 0, Math.max(0, 1 - item.w)),
                y: clamp(drag.startY + dy, 0, Math.max(0, 1 - item.h)),
              }
            : item
        )
      );
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      dragRef.current = null;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startResize = (id: string, e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const current = elements.find((item) => item.id === id);
    const surface = surfaceRef.current;
    if (!current || !surface) return;

    setSelectedId(id);
    resizeRef.current = {
      id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startW: current.w,
      startH: current.h,
    };

    const onMove = (ev: PointerEvent) => {
      const resize = resizeRef.current;
      const activeSurface = surfaceRef.current;
      if (!resize || !activeSurface) return;

      const rect = activeSurface.getBoundingClientRect();
      const dx = rect.width > 0 ? (ev.clientX - resize.startClientX) / rect.width : 0;
      const dy = rect.height > 0 ? (ev.clientY - resize.startClientY) / rect.height : 0;

      setElements((prev) =>
        prev.map((item) => {
          if (item.id !== resize.id) return item;
          const nextW = clamp(resize.startW + dx, 0.06, 1 - item.x);
          const nextH = clamp(resize.startH + dy, 0.04, 1 - item.y);
          return { ...item, w: nextW, h: nextH };
        })
      );
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      resizeRef.current = null;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const renderCompositeImageDataUrl = async (format: 'png' | 'jpeg' = 'png', quality = 0.92) => {
    const resp = await fetch(backgroundImageUrl, { method: 'GET' });
    if (!resp.ok) throw new Error(t.tsep_error_download_background);
    const blob = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);

    try {
      const image = new Image();
      const loaded = new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error(t.tsep_error_load_background));
      });
      image.src = blobUrl;
      await loaded;

      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error(t.tsep_error_export_failed);

      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      const base = Math.min(canvas.width, canvas.height);
      for (const item of elements) {
        const px = item.x * canvas.width;
        const py = item.y * canvas.height;
        const pw = item.w * canvas.width;
        const ph = item.h * canvas.height;
        const fontSize = Math.max(12, Math.round(item.fontSizePx * (canvas.width / imageSize.width)));
        const lineHeight = Math.round(fontSize * 1.22);
        const horizontalPadding = Math.max(8, Math.round(fontSize * 0.3));

        ctx.fillStyle = item.color;
        ctx.font = `${item.fontWeight} ${fontSize}px system-ui`;
        ctx.textBaseline = 'top';
        ctx.textAlign = item.align;
        ctx.shadowColor = item.shadowColor;
        ctx.shadowBlur = Math.max(0, item.shadowBlur * base);
        ctx.shadowOffsetX = item.shadowOffsetX * canvas.width;
        ctx.shadowOffsetY = item.shadowOffsetY * canvas.height;
        ctx.lineJoin = 'round';

        const lines = wrapTextByWidth(ctx, item.text, Math.max(10, pw - horizontalPadding * 2));
        let cursorY = py + 4;
        const drawX =
          item.align === 'center'
            ? px + pw / 2
            : item.align === 'right'
              ? px + pw - horizontalPadding
              : px + horizontalPadding;

        for (const line of lines) {
          if (item.strokeWidth > 0) {
            ctx.lineWidth = Math.max(1, item.strokeWidth * base);
            ctx.strokeStyle = item.strokeColor;
            ctx.strokeText(line, drawX, cursorY);
          }
          ctx.fillText(line, drawX, cursorY);
          cursorY += lineHeight;
          if (cursorY > py + ph - lineHeight) break;
        }

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }

      if (format === 'jpeg') {
        return canvas.toDataURL('image/jpeg', quality);
      }
      return canvas.toDataURL('image/png');
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const url = await renderCompositeImageDataUrl('png');
      const link = document.createElement('a');
      link.href = url;
      link.download = 'text-separation-editor.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setIsExporting(false);
    }
  };

  const downloadTextRepaintTaskImage = async (task: TextRepaintTaskItem) => {
    const previewUrl = String(task.previewUrl || '').trim();
    if (!previewUrl) return;

    const timestamp = formatTaskTimestamp(task.createdAt).replace(/[^0-9_]/g, '');
    const filename = `text-repaint_${timestamp || Date.now()}.png`;

    if (previewUrl.startsWith('data:')) {
      const link = document.createElement('a');
      link.href = previewUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    const resp = await fetch(previewUrl, { method: 'GET' });
    if (!resp.ok) throw new Error(t.tsep_error_download_image);
    const blob = await resp.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const applyTextRepaintTask = (task: TextRepaintTaskItem) => {
    const nextElements = cloneElements(task.elementsSnapshot);
    setElements(nextElements);
    setSelectedId(nextElements[0]?.id || null);
    setTextRepaintGlobalPrompt(task.globalPrompt || '');
  };

  const startTextRepaint = async () => {
    setIsTextRepaintSubmitting(true);
    try {
      const referenceImageDataUrl = await renderCompositeImageDataUrl('jpeg', 0.82);
      const payload: TextSeparationSecondaryCreatePayload = {
        sample_title: sampleTitle,
        background_image_url: backgroundImageUrl,
        original_image_url: originalImageUrl,
        reference_image_data_url: referenceImageDataUrl,
        canvas_aspect_ratio: imageSize.width / Math.max(1, imageSize.height),
        global_prompt: textRepaintGlobalPrompt,
        elements: elements.map((item) => ({
          id: item.id,
          text: item.text,
          bbox: [
            Math.round(item.y * 1000),
            Math.round(item.x * 1000),
            Math.round((item.y + item.h) * 1000),
            Math.round((item.x + item.w) * 1000),
          ],
          prompt: item.prompt,
        })),
        elements_snapshot: cloneElements(elements),
      };
      const task = await videoApi.textSeparationSecondaryCreate(payload);
      const fallbackTaskState = {
        sampleTitle,
        backgroundImageUrl,
        originalImageUrl,
        globalPrompt: textRepaintGlobalPrompt,
        elementsSnapshot: cloneElements(elements),
        canvasAspectRatio: imageSize.width / Math.max(1, imageSize.height),
      };
      setTextRepaintTasks((prev) => [
        mapCreateTaskToTextRepaintTask(task, fallbackTaskState),
        ...prev,
      ]);
    } finally {
      setIsTextRepaintSubmitting(false);
    }
  };

  const exportTextJson = () => {
    const payload = {
      text_blocks: elements.map((item) => ({
        id: item.id,
        text: item.text,
        bbox: [
          Math.round(item.y * 1000),
          Math.round(item.x * 1000),
          Math.round((item.y + item.h) * 1000),
          Math.round((item.x + item.w) * 1000),
        ],
        font_size: Math.round(item.fontSizePx),
        color: [
          parseInt(item.color.slice(1, 3), 16),
          parseInt(item.color.slice(3, 5), 16),
          parseInt(item.color.slice(5, 7), 16),
        ],
      })),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'text-blocks.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportPptx = async () => {
    setIsExportingPptx(true);
    try {
      const resp = await fetch(backgroundImageUrl, { method: 'GET' });
      if (!resp.ok) throw new Error(t.tsep_error_download_background);
      const blob = await resp.blob();
      const dataUrl = await blobToDataUrl(blob);

      const pptx = new PptxGenJS();
      const ratio = imageSize.width / imageSize.height;
      const slideHeight = 7.5;
      const slideWidth = Math.max(4, Number((slideHeight * ratio).toFixed(3)));

      pptx.layout = 'LAYOUT_WIDE';
      pptx.defineLayout({ name: 'VFLOW_TEXT_SEP', width: slideWidth, height: slideHeight });
      pptx.layout = 'VFLOW_TEXT_SEP';
      pptx.author = 'VFlow';
      pptx.subject = sampleTitle;
      pptx.title = `${sampleTitle} - AI Poster Editor`;
      pptx.company = 'VFlow';

      const slide = pptx.addSlide();
      slide.background = { color: 'FFFFFF' };
      slide.addImage({
        data: dataUrl,
        x: 0,
        y: 0,
        w: slideWidth,
        h: slideHeight,
      });

      const pptScale = Math.min((slideWidth * 96) / imageSize.width, (slideHeight * 96) / imageSize.height);
      elements.forEach((item) => {
        const fontSizePt = Math.max(6, Number(((item.fontSizePx * pptScale * 72) / 96).toFixed(1)));
        const shadowDx = item.shadowOffsetX * imageSize.width;
        const shadowDy = item.shadowOffsetY * imageSize.height;
        const shadowOffset = Math.sqrt(shadowDx * shadowDx + shadowDy * shadowDy);
        const shadowAngle = ((Math.atan2(shadowDy, shadowDx) * 180) / Math.PI + 360) % 360;
        slide.addText(item.text, {
          x: Number((item.x * slideWidth).toFixed(3)),
          y: Number((item.y * slideHeight).toFixed(3)),
          w: Number((item.w * slideWidth).toFixed(3)),
          h: Number((item.h * slideHeight).toFixed(3)),
          fontFace: isZh ? PPT_FONT_FACE_ZH : PPT_FONT_FACE_EN,
          fontSize: fontSizePt,
          bold: item.fontWeight >= 600,
          color: hexToRgb(item.color),
          align: item.align,
          margin: 0,
          breakLine: false,
          valign: 'middle',
          fit: 'none',
          fill: { color: 'FFFFFF', transparency: 100 },
          line: { color: 'FFFFFF', transparency: 100 },
          outline:
            item.strokeWidth > 0
              ? {
                  color: hexToRgb(item.strokeColor),
                  size: Math.max(0.5, Number((item.strokeWidth * Math.min(imageSize.width, imageSize.height) * pptScale * 0.75).toFixed(2))),
                }
              : undefined,
          shadow:
            item.shadowBlur > 0 || item.shadowOffsetX !== 0 || item.shadowOffsetY !== 0
              ? {
                  type: 'outer',
                  color: hexToRgb(item.shadowColor),
                  blur: Math.max(1, Math.round(item.shadowBlur * Math.min(imageSize.width, imageSize.height) * pptScale)),
                  angle: Math.round(shadowAngle),
                  offset: Math.max(
                    1,
                    Math.round(
                      shadowOffset
                    )
                  ),
                  opacity: 0.35,
                }
              : undefined,
        });
      });

      await pptx.writeFile({ fileName: 'text-separation-editor.pptx' });
    } finally {
      setIsExportingPptx(false);
    }
  };

  return (
    <div className={styles.root}>
      <div className="flex items-center">
        <button type="button" onClick={onBack} className={styles.secondaryButton}>
          <ArrowLeft className="w-4 h-4" />
          {t.tsep_back_to_records}
        </button>
      </div>

      <div className="flex-1 min-h-0 flex items-start gap-5">
        <CanvasPanel
          t={t}
          backgroundImageUrl={backgroundImageUrl}
          sampleTitle={sampleTitle}
          elements={elements}
          selectedId={selectedId}
          imageSize={imageSize}
          surfaceViewport={surfaceViewport}
          surfaceBaseSize={surfaceBaseSize}
          surfaceRef={surfaceRef}
          surfaceViewportRef={surfaceViewportRef}
          onSelect={setSelectedId}
          onAddTextElement={addTextElement}
          onDeleteElement={(id) => {
            setElements((prev) => {
              const filtered = prev.filter((item) => item.id !== id);
              setSelectedId((current) => (current === id ? filtered[0]?.id || null : current));
              return filtered;
            });
          }}
          onStartDrag={startDrag}
          onStartResize={startResize}
          isExporting={isExporting}
          isExportingPptx={isExportingPptx}
          isExportMenuOpen={isExportMenuOpen}
          onReset={() => {
            setElements(initialElements);
            setSelectedId(initialElements[0]?.id || null);
            setTextRepaintGlobalPrompt('');
          }}
          onToggleExportMenu={() => setIsExportMenuOpen((prev) => !prev)}
          onExportJson={() => {
            exportTextJson();
            setIsExportMenuOpen(false);
          }}
          onExportPptx={async () => {
            setIsExportMenuOpen(false);
            await exportPptx();
          }}
          onExportPng={async () => {
            setIsExportMenuOpen(false);
            await handleExport();
          }}
        />

        <SettingsPanel
          t={t}
          selectedElement={selectedElement}
          textRepaintGlobalPrompt={textRepaintGlobalPrompt}
          originalImageUrl={originalImageUrl}
          isTextRepaintSubmitting={isTextRepaintSubmitting}
          onGlobalPromptChange={setTextRepaintGlobalPrompt}
          onStartTextRepaint={() => void startTextRepaint()}
          onUpdateElement={updateElement}
        />
        <TaskDrawer
          t={t}
          isOpen={isTaskDrawerOpen}
          isZh={isZh}
          imageAspectRatio={imageSize.width / Math.max(1, imageSize.height)}
          tasks={textRepaintTasks}
          onToggle={() => setIsTaskDrawerOpen((prev) => !prev)}
          onPreview={setPreviewTask}
          onApply={applyTextRepaintTask}
          onDownload={(task) => {
            void downloadTextRepaintTaskImage(task);
          }}
        />
      </div>

        <PreviewDialog
          t={t}
          previewTask={previewTask}
          onClose={() => setPreviewTask(null)}
          onApplyAndClose={(task) => {
            applyTextRepaintTask(task);
            setPreviewTask(null);
          }}
          onDownload={(task) => {
            void downloadTextRepaintTaskImage(task);
          }}
        />
    </div>
  );
};

export default TextSeparationDemoView;
