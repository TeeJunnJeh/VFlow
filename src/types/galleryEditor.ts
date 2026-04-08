export interface GalleryEditorElement {
  id: string;
  type: 'text';
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  font_size?: number;
  font_weight?: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
  background?: string;
}

export interface GalleryEditorLayer {
  id: string;
  layer_type: string;
  element_type: string;
  name: string;
  editable: boolean;
  visible: boolean;
  z_index: number;
  rect: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  asset_url?: string;
  text_content?: string;
  style?: Record<string, unknown>;
}

export interface GalleryLayout {
  version: number;
  canvas_width: number;
  canvas_height: number;
  aspect_ratio: string;
  template_id?: string;
  background_url?: string;
  elements: GalleryEditorElement[];
  layers?: GalleryEditorLayer[];
}

