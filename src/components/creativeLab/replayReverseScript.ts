import type { ReplayReverseScriptData } from '../../services/video';

type AnyRecord = Record<string, unknown>;

export type ReplayScriptBundle = {
  displayScript: string;
  seedanceScript: string;
  analysisMode?: string;
  directVideoUsed?: boolean;
  fallbackReason?: string;
};

const asRecord = (value: unknown): AnyRecord => (value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : {});
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown) => String(value || '').trim();

const firstText = (...values: unknown[]) => values.map(text).find(Boolean) || '';

const getOverallFeatures = (data: AnyRecord) => {
  const arch = asRecord(data.scriptArchitecture || data.script_architecture);
  return asRecord(data.overallFeatures || data.overall_features || arch.overall_features || arch.overallFeatures);
};

const getStoryboardSegments = (data: AnyRecord) => {
  const arch = asRecord(data.scriptArchitecture || data.script_architecture);
  return asArray(data.storyboardSegments || data.storyboard_segments || arch.storyboard_segments || arch.storyboardSegments)
    .filter((item): item is AnyRecord => Boolean(item && typeof item === 'object' && !Array.isArray(item)));
};

const formatOverallFeatures = (features: AnyRecord) => {
  const lines: string[] = [];
  const mappings: Array<[string, string]> = [
    ['风格', 'style'],
    ['环境', 'environment'],
    ['语调与节奏', 'tone_pacing'],
    ['镜头', 'camera'],
    ['光线', 'lighting'],
    ['音乐/声音', 'music_sound'],
    ['剪辑节奏', 'editing_rhythm'],
    ['情绪氛围', 'emotion_atmosphere'],
  ];
  mappings.forEach(([label, key]) => {
    const value = text(features[key]);
    if (value) lines.push(`[${label}]: ${value}`);
  });
  return lines;
};

const formatStoryboardSegments = (segments: AnyRecord[]) => {
  const lines: string[] = [];
  segments.forEach((segment, index) => {
    const sceneIndex = firstText(segment.act_index, segment.scene_index) || String(index + 1);
    const actType = firstText(segment.act_type, segment.type);
    const duration = firstText(segment.estimated_duration, segment.time_range, segment.time);
    const title = firstText(segment.act_title, segment.scene_title, segment.title);
    lines.push(`${sceneIndex}. ${[actType, duration, title].filter(Boolean).join(' · ')}`.trim());
    const mappings: Array<[string, string]> = [
      ['动作弧线', 'motion_arc'],
      ['起始关键姿态', 'key_pose_start'],
      ['结束关键姿态', 'key_pose_end'],
      ['人物', 'people'],
      ['姿态', 'posture'],
      ['五官', 'facial_features'],
      ['动作', 'action'],
      ['商品状态', 'product_state'],
      ['语言', 'spoken_language'],
      ['环境', 'environment'],
      ['音乐', 'music_sound'],
      ['文本', 'on_screen_text'],
      ['镜头', 'camera'],
      ['镜头意图', 'camera_intent'],
      ['光线', 'lighting'],
      ['入场转场', 'transition_in'],
      ['出场转场', 'transition_out'],
      ['特效/剪辑', 'effects_editing'],
      ['连续性', 'continuity_bridge'],
      ['连续性补充', 'continuity_notes'],
      ['Seedance动作幕提示词', 'seedance_motion_prompt'],
      ['Seedance单镜提示词', 'seedance_reconstruction_prompt'],
    ];
    mappings.forEach(([label, key]) => {
      const value = text(segment[key]);
      if (value) lines.push(`  [${label}]: ${value}`);
    });
  });
  return lines;
};

export const formatReplayReverseScript = (input: unknown): string => {
  const data = asRecord(input);
  const features = getOverallFeatures(data);
  const segments = getStoryboardSegments(data);
  const detailedLines: string[] = [];

  const summary = firstText(data.video_master_script, asRecord(data.scriptArchitecture || data.script_architecture).video_master_script, data.summary);
  if (summary) detailedLines.push('【视频逆向详尽脚本】', '', '整体概述：', summary);

  const featureLines = formatOverallFeatures(features);
  if (featureLines.length > 0) detailedLines.push('', '总体特征：', ...featureLines);

  const segmentLines = formatStoryboardSegments(segments);
  if (segmentLines.length > 0) detailedLines.push('', '逐分镜/分幕细节：', ...segmentLines);

  const seedancePrompt = firstText(data.seedanceMotionPrompt, data.seedance_motion_prompt, data.seedancePrompt, data.seedance_prompt, data.suggestedPrompt);
  if (seedancePrompt && detailedLines.length > 0) detailedLines.push('', '【Seedance 执行提示词】', seedancePrompt);
  if (detailedLines.length > 0) return detailedLines.join('\n').trim();

  return firstText(
    data.userFacingScript,
    data.user_facing_script,
    data.scriptBrief,
    data.seedancePrompt,
    data.seedance_prompt,
    data.suggestedPrompt,
    data.styleReferenceText,
  );
};

export const pickReplayScripts = (input: ReplayReverseScriptData | AnyRecord | undefined | null): ReplayScriptBundle => {
  const data = asRecord(input);
  const displayScript = formatReplayReverseScript(data);
  const seedanceScript = firstText(
    data.seedanceMotionPrompt,
    data.seedance_motion_prompt,
    data.seedancePrompt,
    data.seedance_prompt,
    data.suggestedPrompt,
    displayScript,
  );
  return {
    displayScript,
    seedanceScript,
    analysisMode: text(data.analysisMode) || undefined,
    directVideoUsed: typeof data.directVideoUsed === 'boolean' ? data.directVideoUsed : undefined,
    fallbackReason: text(data.fallbackReason) || undefined,
  };
};