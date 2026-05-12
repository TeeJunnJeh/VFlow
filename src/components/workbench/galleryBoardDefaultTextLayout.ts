export type GalleryBoardImageFrame = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  linkedImageLayerId?: string | null;
};

export type GalleryBoardSellingPointLayer = {
  id: string;
  type: 'text';
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
  background: string;
  align: 'left' | 'center' | 'right';
  lineHeight: number;
  padding: number;
  linkedImageLayerId?: string | null;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const buildGalleryBoardSellingPointLayers = (
  frames: GalleryBoardImageFrame[],
  sellingPoints: string[]
): GalleryBoardSellingPointLayer[] => {
  const cleanSellingPoints = sellingPoints.map((item) => String(item || '').trim()).filter(Boolean);

  return frames.map((frame, index) => {
    const text = cleanSellingPoints[index % Math.max(cleanSellingPoints.length, 1)] || `卖点 ${index + 1}`;
    const textHeight = Math.round(clamp(frame.h * 0.18, 44, Math.max(44, frame.h * 0.28)));
    const padding = Math.round(clamp(Math.min(frame.w, frame.h) * 0.035, 8, 24));

    return {
      id: `board-layer-selling-${index + 1}`,
      type: 'text',
      name: `Selling Point ${index + 1}`,
      text,
      x: frame.x,
      y: frame.y + frame.h - textHeight,
      w: frame.w,
      h: textHeight,
      fontSize: clamp(Math.round(Math.min(frame.w * 0.07, frame.h * 0.14)), 18, 52),
      fontWeight: 800,
      fontFamily: 'Microsoft YaHei',
      color: '#ffffff',
      background: 'rgba(0,0,0,0.48)',
      align: 'center',
      lineHeight: 1.08,
      padding,
      linkedImageLayerId: frame.linkedImageLayerId || frame.id,
    };
  });
};
