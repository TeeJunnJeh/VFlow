/**
 * Canvas Script Generation Service
 *
 * Encapsulates script generation API calls and response parsing.
 * Response parsing logic is adapted from WorkbenchView's extractScriptPages/parseScriptPage
 * to handle the backend's multi-level response envelope:
 *   { data: { script_contents: [{ script_content: { shots: [...] } }] } }
 */

import { videoApi } from '../../../services/video';
import type { ScriptShot } from './canvasTypes';

// ---------------------------------------------------------------------------
// Response Parsing (adapted from WorkbenchView.tsx lines 3614-3636)
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Unwrap the API envelope: response → response.data */
function unwrapPayload(data: any): any {
  if (!data || typeof data !== 'object') return data;
  if (data.data && typeof data.data === 'object') return data.data;
  return data;
}

/** Map a raw shot object to our ScriptShot type */
function mapShot(shot: any, idx: number): ScriptShot {
  return {
    shot_index: shot.shot_index ?? idx + 1,
    type: shot.type || 'Medium',
    duration_sec: shot.duration_sec || 3,
    visual: shot.visual || '',
    audio: shot.audio || shot.voiceover || '',
    voiceover: shot.voiceover || '',
  };
}

/**
 * Parse the generateScript API response into ScriptShot[].
 *
 * Handles multiple response shapes from the backend:
 * 1. script_contents array (primary)
 * 2. script_variants / variants array (alternate)
 * 3. Direct script_content.shots (fallback)
 * 4. Direct shots array (last resort)
 */
export function parseScriptResponse(response: any): ScriptShot[] {
  const root = unwrapPayload(response);
  if (!root) return [];

  // Primary path: script_contents[0].script_content.shots
  const contents = root.script_contents || root.script_variants || root.variants;
  if (Array.isArray(contents) && contents.length > 0) {
    const first = contents[0];
    const shots = first?.script_content?.shots || first?.shots || [];
    if (Array.isArray(shots) && shots.length > 0) {
      return shots.map(mapShot);
    }
  }

  // Fallback: root.script_content.shots
  if (root.script_content?.shots && Array.isArray(root.script_content.shots)) {
    return root.script_content.shots.map(mapShot);
  }

  // Last resort: root.shots
  if (Array.isArray(root.shots) && root.shots.length > 0) {
    return root.shots.map(mapShot);
  }

  return [];
}

// ---------------------------------------------------------------------------
// Payload Construction (adapted from WorkbenchView.tsx lines 3494-3519)
// ---------------------------------------------------------------------------

interface ScriptConfig {
  category: string;
  style: string;
  shotCount: number;
  duration: number;
  aspectRatio: string;
  notes: string;
}

export function buildScriptPayload(
  config: ScriptConfig,
  imagePaths: string[],
  textContent: string,
  language: string
): Record<string, unknown> {
  return {
    product_category: config.category,
    visual_style: config.style,
    aspect_ratio: config.aspectRatio,
    user_language: language,
    target_language: language,
    sound: 'on',
    script_count: 1,
    script_content: {
      duration: config.duration,
      shot_number: config.shotCount,
      custom: config.notes,
      input: textContent,
      shots: [],
    },
    reference_assets: imagePaths.map((path) => ({
      path,
      type: 'reference_image',
    })),
  };
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Generate a script via the API and return parsed shots.
 * Throws on API error.
 */
export async function generateScriptForCanvas(
  userId: string | number,
  config: ScriptConfig,
  imagePaths: string[],
  textContent: string,
  language: string
): Promise<ScriptShot[]> {
  const payload = buildScriptPayload(config, imagePaths, textContent, language);
  const response = await videoApi.generateScript(userId, payload);
  return parseScriptResponse(response);
}
