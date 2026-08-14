import type { TextSeparationBlock } from '../../components/workbench/TextSeparationDemoView';

export interface AgentPosterEditorData {
  history_record_id?: string;
  sample_title: string;
  original_image_url: string;
  clean_image_url: string;
  text_blocks: TextSeparationBlock[];
}

export const readAgentPosterEditorData = (value: unknown): AgentPosterEditorData | null => {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  const original = String(data.original_image_url || '').trim();
  const clean = String(data.clean_image_url || '').trim();
  if (!original || !clean || !Array.isArray(data.text_blocks)) return null;
  return {
    history_record_id: String(data.history_record_id || ''),
    sample_title: String(data.sample_title || 'Poster'),
    original_image_url: original,
    clean_image_url: clean,
    text_blocks: data.text_blocks as TextSeparationBlock[],
  };
};
