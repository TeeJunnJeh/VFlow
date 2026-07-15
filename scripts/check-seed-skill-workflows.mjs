import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\r\n?/g, '\n');

const types = read('src/components/workbench/types.ts');
const sidebar = read('src/components/workbench/Sidebar.tsx');
const workbench = read('src/pages/Workbench.tsx');
const skillVideo = read('src/components/creativeLab/SkillVideoGenerationView.tsx');
const promptRefine = read('src/components/creativeLab/SeedancePromptRefineView.tsx');

const requireText = (source, text, label) => {
  if (!source.includes(text)) throw new Error(`${label}: missing ${JSON.stringify(text)}`);
};

const rejectText = (source, text, label) => {
  if (source.includes(text)) throw new Error(`${label}: still contains ${JSON.stringify(text)}`);
};

requireText(types, "'creative_lab_skill_video'", 'view types');
requireText(types, "'creative_lab_prompt_refine'", 'view types');
rejectText(types, "'seed_skill_studio'", 'view types');

requireText(sidebar, 'skill视频生成', 'Creative Lab navigation');
requireText(sidebar, 'prompt精修', 'Creative Lab navigation');
requireText(sidebar, 'creativeLabSubnavWidth', 'Creative Lab navigation sizing');
requireText(sidebar, 'creativeLabLabelRefs', 'Creative Lab navigation sizing');
rejectText(sidebar, 'view="seed_skill_studio"', 'primary navigation');
rejectText(sidebar, 'label="Skill 视频"', 'primary navigation');

requireText(workbench, 'SkillVideoGenerationView', 'Workbench route');
requireText(workbench, 'SeedancePromptRefineView', 'Workbench route');
rejectText(workbench, 'SeedSkillStudioView', 'Workbench route');
rejectText(workbench, "activeView === 'seed_skill_studio'", 'Workbench route');

requireText(skillVideo, 'videoApi.rollSeedSkill', 'skill workflow');
requireText(skillVideo, 'videoApi.createSeedSkillWorkflow', 'skill workflow');
requireText(skillVideo, 'videoApi.finalizeSeedSkillWorkflow', 'skill workflow');
requireText(skillVideo, 'videoApi.submitSeedSkillWorkflowVideo', 'skill workflow');
requireText(skillVideo, 'seed_skill_workflow_id: workflow.id', 'Agent recipe snapshot');
requireText(skillVideo, '保存为 Agent 经验', 'Agent recipe snapshot');
requireText(
  skillVideo,
  "applyWorkflow(next);\n      setStatusText('');\n      await loadHistory();",
  'skill workflow upload status',
);
rejectText(skillVideo, '创意编号', 'skill workflow UI');

requireText(promptRefine, 'videoApi.refineSeedancePrompt', 'Prompt refinement workflow');
requireText(promptRefine, "'short'", 'Prompt refinement formats');
requireText(promptRefine, "'storyboard'", 'Prompt refinement formats');
requireText(promptRefine, "'one_shot'", 'Prompt refinement formats');
requireText(promptRefine, 'uploadCreativePromptMaterials', 'Prompt refinement materials');
requireText(
  promptRefine,
  "setPromptDraft(response.data.final_prompt || '');\n      setStatusText('');",
  'Prompt refinement upload status',
);

console.log('Seed skill workflow source contract passed.');
