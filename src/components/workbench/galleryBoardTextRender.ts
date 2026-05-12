export type GalleryBoardTextAlign = 'left' | 'center' | 'right';

export const getGalleryBoardTextDisplayProps = (align: GalleryBoardTextAlign) => ({
  className: 'block h-full w-full overflow-hidden whitespace-pre-wrap break-words',
  style: {
    textAlign: align,
  } as const,
});
