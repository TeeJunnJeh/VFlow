import type { Layer } from 'ag-psd';

export type PsdRgbColor = {
  r: number;
  g: number;
  b: number;
};

export type GalleryBoardPsdTextAlign = 'left' | 'center' | 'right';

export type GalleryBoardPsdTextInput = {
  name: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  color: string;
  align: GalleryBoardPsdTextAlign;
};

export type GalleryBoardPsdLayer = Layer & {
  name: string;
  text?: {
    text: string;
    transform: [number, number, number, number, number, number];
    left: number;
    top: number;
    right: number;
    bottom: number;
    shapeType: 'box';
    boxBounds: [number, number, number, number];
    antiAlias: 'smooth';
    orientation: 'horizontal';
    style: {
      font: { name: string };
      fontSize: number;
      fauxBold: boolean;
      fillColor: PsdRgbColor;
      fillFlag: true;
    };
    paragraphStyle: {
      justification: GalleryBoardPsdTextAlign;
    };
  };
};

const PSD_LAYER_NAME_MAX_LENGTH = 48;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const sanitizePsdLayerName = (value: string, fallback = 'Layer') => {
  const normalized = String(value || '')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim();

  return (normalized || fallback).slice(0, PSD_LAYER_NAME_MAX_LENGTH);
};

export const getPsdFontName = (fontFamily: string) => {
  const normalized = String(fontFamily || '')
    .split(',')
    .map((item) => item.replace(/["']/g, '').trim())
    .find(Boolean);

  if (!normalized || normalized === 'system-ui' || normalized === 'sans-serif') return 'ArialMT';
  if (/microsoft\s+yahei/i.test(normalized)) return 'MicrosoftYaHei';
  if (/pingfang\s+sc/i.test(normalized)) return 'PingFangSC-Regular';
  if (/simhei/i.test(normalized)) return 'SimHei';
  return normalized.replace(/\s+/g, '');
};

export const colorStringToPsdRgb = (value: string, fallback = '#ffffff'): PsdRgbColor => {
  const raw = String(value || '').trim();
  const hexMatch = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1].length === 3
      ? hexMatch[1].split('').map((char) => `${char}${char}`).join('')
      : hexMatch[1];
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }

  const rgbaMatch = raw.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?:,\s*\d+(?:\.\d+)?\s*)?\)$/i);
  if (rgbaMatch) {
    return {
      r: clamp(Math.round(Number(rgbaMatch[1]) || 0), 0, 255),
      g: clamp(Math.round(Number(rgbaMatch[2]) || 0), 0, 255),
      b: clamp(Math.round(Number(rgbaMatch[3]) || 0), 0, 255),
    };
  }

  if (raw === 'transparent') return colorStringToPsdRgb(fallback);
  return raw === fallback ? { r: 255, g: 255, b: 255 } : colorStringToPsdRgb(fallback);
};

export const buildPsdTextLayer = (input: GalleryBoardPsdTextInput): GalleryBoardPsdLayer => {
  const x = Math.round(input.x);
  const y = Math.round(input.y);
  const w = Math.max(1, Math.round(input.w));
  const h = Math.max(1, Math.round(input.h));

  return {
    name: sanitizePsdLayerName(input.name, 'Text'),
    opacity: 1,
    text: {
      text: input.text || ' ',
      transform: [1, 0, 0, 1, x, y],
      left: x,
      top: y,
      right: x + w,
      bottom: y + h,
      shapeType: 'box',
      boxBounds: [0, 0, h, w],
      antiAlias: 'smooth',
      orientation: 'horizontal',
      style: {
        font: { name: getPsdFontName(input.fontFamily) },
        fontSize: Math.max(6, Math.round(input.fontSize)),
        fauxBold: input.fontWeight >= 600,
        fillColor: colorStringToPsdRgb(input.color, '#ffffff'),
        fillFlag: true,
      },
      paragraphStyle: {
        justification: input.align,
      },
    },
  };
};
