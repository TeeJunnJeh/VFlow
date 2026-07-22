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
rejectText('const url = task.result?.video_url || task.result?.url;', 'raw automatic task preview URL');
rejectText('const rawUrl = task.result?.video_url || task.result?.url;\n                         const url = typeof rawUrl === \'string\' ? rawUrl : \'\';', 'raw completed task queue URL');

console.log('Workbench preview URL contract passed.');
