export type GalleryOutputType =
  | 'white_bg'
  | 'scene'
  | 'selling_point'
  | 'cover'
  | 'poster';

export type GalleryAspectRatio =
  | '1:1'
  | '4:5'
  | '9:16';

export interface GalleryRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GalleryTemplateSlot {
  id: string;
  slot_type: string;
  name: string;
  editable: boolean;
  required: boolean;
  rect: GalleryRect;
  style_preset?: Record<string, unknown>;
}

export interface GalleryTemplateDefinition {
  id: string;
  name: string;
  description?: string;
  output_type: GalleryOutputType;
  aspect_ratio: GalleryAspectRatio;
  canvas_width: number;
  canvas_height: number;
  thumbnail_url?: string;
  tags?: string[];
  default_palette?: string[];
  slots: GalleryTemplateSlot[];
  version: number;
  is_active: boolean;
}

