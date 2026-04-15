export interface LoadingTheme {
  mode: 'mono' | 'muted' | 'vivid';
  primary: string;
  secondary: string;
  accent: string;
  quaternary: string;
  surface: string;
}

type RGB = { r: number; g: number; b: number };
type HSL = { h: number; s: number; l: number };

const DEFAULT_THEME: LoadingTheme = {
  mode: 'vivid',
  primary: '#baa8ff',
  secondary: '#a5dcff',
  accent: '#ffd2b4',
  quaternary: '#ffb4dc',
  surface: '#ffffff',
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const hueToRgb = (p: number, q: number, t: number) => {
  let nextT = t;
  if (nextT < 0) nextT += 1;
  if (nextT > 1) nextT -= 1;
  if (nextT < 1 / 6) return p + (q - p) * 6 * nextT;
  if (nextT < 1 / 2) return q;
  if (nextT < 2 / 3) return p + (q - p) * (2 / 3 - nextT) * 6;
  return p;
};

const rgbToHsl = ({ r, g, b }: RGB): HSL => {
  const nr = r / 255;
  const ng = g / 255;
  const nb = b / 255;
  const max = Math.max(nr, ng, nb);
  const min = Math.min(nr, ng, nb);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l };

  const delta = max - min;
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

  let h = 0;
  switch (max) {
    case nr:
      h = (ng - nb) / delta + (ng < nb ? 6 : 0);
      break;
    case ng:
      h = (nb - nr) / delta + 2;
      break;
    default:
      h = (nr - ng) / delta + 4;
      break;
  }

  return { h: h / 6, s, l };
};

const hslToRgb = ({ h, s, l }: HSL): RGB => {
  if (s === 0) {
    const gray = Math.round(l * 255);
    return { r: gray, g: gray, b: gray };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hueToRgb(p, q, h) * 255),
    b: Math.round(hueToRgb(p, q, h - 1 / 3) * 255),
  };
};

const rgbToHex = ({ r, g, b }: RGB) =>
  `#${[r, g, b].map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0')).join('')}`;

const hexToRgb = (hex: string): RGB => {
  const cleaned = String(hex || '').trim().replace('#', '');
  const normalized = cleaned.length === 3
    ? cleaned.split('').map((char) => char + char).join('')
    : cleaned;
  const value = /^[0-9a-fA-F]{6}$/.test(normalized) ? parseInt(normalized, 16) : 0;
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
};

const blendRgb = (source: RGB, target: RGB, targetWeight: number): RGB => {
  const weight = clamp(targetWeight, 0, 1);
  return {
    r: source.r * (1 - weight) + target.r * weight,
    g: source.g * (1 - weight) + target.g * weight,
    b: source.b * (1 - weight) + target.b * weight,
  };
};

const loadImageElement = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('failed_to_load_image'));
    img.src = src;
  });

const collectStatsFromSource = async (src: string) => {
  const image = await loadImageElement(src);
  const canvas = document.createElement('canvas');
  const size = 48;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('failed_to_create_canvas');

  ctx.drawImage(image, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let totalS = 0;
  let count = 0;

  for (let index = 0; index < data.length; index += 12) {
    const alpha = data[index + 3];
    if (alpha < 140) continue;

    const rgb = {
      r: data[index],
      g: data[index + 1],
      b: data[index + 2],
    };
    const hsl = rgbToHsl(rgb);
    if (hsl.l < 0.06 || hsl.l > 0.96) continue;

    totalR += rgb.r;
    totalG += rgb.g;
    totalB += rgb.b;
    totalS += hsl.s;
    count += 1;
  }

  if (!count) throw new Error('no_usable_pixels');

  return {
    rgb: {
      r: totalR / count,
      g: totalG / count,
      b: totalB / count,
    },
    saturation: totalS / count,
  };
};

const buildMonoTheme = (): LoadingTheme => ({
  mode: 'mono',
  primary: '#c8d0e6',
  secondary: '#afbddc',
  accent: '#eef3ff',
  quaternary: '#d4def3',
  surface: '#ffffff',
});

const pastelize = (baseHue: number, saturation: number, lightness: number) =>
  hslToRgb({
    h: (baseHue + 1) % 1,
    s: clamp(saturation, 0.4, 0.68),
    l: clamp(lightness, 0.7, 0.82),
  });

const buildPastelTheme = (rgb: RGB, saturation: number): LoadingTheme => {
  const base = rgbToHsl(rgb);
  const mode: LoadingTheme['mode'] = saturation < 0.22 ? 'muted' : 'vivid';

  const sourcePrimary = pastelize(base.h, Math.max(base.s, 0.44), 0.77);
  const sourceSecondary = pastelize(base.h + 0.085, Math.max(base.s * 0.86, 0.42), 0.79);
  const sourceAccent = pastelize(base.h - 0.07, Math.max(base.s * 0.8, 0.4), 0.8);
  const sourceQuaternary = pastelize(base.h + 0.03, Math.max(base.s * 0.82, 0.41), 0.78);

  const primary = blendRgb(sourcePrimary, hexToRgb(DEFAULT_THEME.primary), 0.16);
  const secondary = blendRgb(sourceSecondary, hexToRgb(DEFAULT_THEME.secondary), 0.18);
  const accent = blendRgb(sourceAccent, hexToRgb(DEFAULT_THEME.accent), 0.16);
  const quaternary = blendRgb(sourceQuaternary, hexToRgb(DEFAULT_THEME.quaternary), 0.18);

  return {
    mode,
    primary: rgbToHex(primary),
    secondary: rgbToHex(secondary),
    accent: rgbToHex(accent),
    quaternary: rgbToHex(quaternary),
    surface: DEFAULT_THEME.surface,
  };
};

export const getDefaultLoadingTheme = (): LoadingTheme => DEFAULT_THEME;

export const extractLoadingThemeFromSources = async (sources: string[]): Promise<LoadingTheme> => {
  if (typeof window === 'undefined') return DEFAULT_THEME;

  const candidates = sources
    .map((source) => String(source || '').trim())
    .filter(Boolean)
    .slice(0, 3);

  if (candidates.length === 0) return DEFAULT_THEME;

  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let totalS = 0;
  let successCount = 0;

  for (const source of candidates) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const stats = await collectStatsFromSource(source);
      totalR += stats.rgb.r;
      totalG += stats.rgb.g;
      totalB += stats.rgb.b;
      totalS += stats.saturation;
      successCount += 1;
    } catch {
      // Ignore per-source failures and continue with remaining uploads.
    }
  }

  if (!successCount) return DEFAULT_THEME;

  const averageRgb = {
    r: totalR / successCount,
    g: totalG / successCount,
    b: totalB / successCount,
  };
  const averageSaturation = totalS / successCount;

  if (averageSaturation < 0.12) return buildMonoTheme();
  return buildPastelTheme(averageRgb, averageSaturation);
};
