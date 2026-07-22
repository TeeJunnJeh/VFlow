import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/workbench/WorkbenchView.tsx', import.meta.url), 'utf8').replace(/\r\n?/g, '\n');

const requireText = (text, label) => {
  if (!source.includes(text)) throw new Error(`${label}: missing ${JSON.stringify(text)}`);
};

const rejectText = (text, label) => {
  if (source.includes(text)) throw new Error(`${label}: still contains ${JSON.stringify(text)}`);
};

requireText('const toDisplayUrl =', 'display URL normalizer');
requireText('const url = toDisplayUrl(task.result?.video_url || task.result?.url);', 'automatic task preview URL normalization');
requireText('const url = toDisplayUrl(rawUrl);', 'completed task queue URL normalization');
requireText('const videoUrl = toDisplayUrl(task?.result?.video_url || task?.result?.url);', 'replay result URL normalization');
requireText('setGeneratedVideoUrl(toDisplayUrl(workspace.generatedVideoUrl) || null);', 'workspace result URL normalization');
requireText("const backendPreviewProjectId = String(lastGeneratedProjectId || '').trim();", 'backend preview project target');
requireText("const workbenchPreviewProjectId = String(projectStore.currentProjectId || '').trim();", 'workbench preview project target');
requireText('backendProjectId === backendPreviewProjectId', 'backend project ID matching');
requireText('workbenchProjectId === workbenchPreviewProjectId', 'workbench project ID matching');
requireText('if (picked.task.projectId) setLastGeneratedProjectId(picked.task.projectId);', 'backend project ID restoration');
rejectText('const url = task.result?.video_url || task.result?.url;', 'raw automatic task preview URL');
rejectText('const rawUrl = task.result?.video_url || task.result?.url;\n                         const url = typeof rawUrl === \'string\' ? rawUrl : \'\';', 'raw completed task queue URL');
rejectText('const preferredProjectId = lastGeneratedProjectId || projectStore.currentProjectId;', 'mixed backend and workbench project target');
rejectText(".filter((task) => task.type === 'video_generation' && task.projectId === preferredProjectId)", 'mixed project ID comparison');

console.log('Workbench preview URL contract passed.');
