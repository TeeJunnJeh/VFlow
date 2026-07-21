import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\r\n?/g, '\n');

const workbench = read('src/components/workbench/WorkbenchView.tsx');
const translations = read('src/i18n/translations.ts');

const requireText = (source, text, label) => {
  if (!source.includes(text)) throw new Error(`${label}: missing ${JSON.stringify(text)}`);
};

const rejectText = (source, text, label) => {
  if (source.includes(text)) throw new Error(`${label}: still contains ${JSON.stringify(text)}`);
};

requireText(workbench, "const WORKBENCH_VIDEO_MODEL = 'seedance2.0' as const;", 'fixed workbench model');
requireText(workbench, 'setSelectedModel(WORKBENCH_VIDEO_MODEL)', 'model normalization');
requireText(workbench, 'selectedModelId: WORKBENCH_VIDEO_MODEL', 'persisted workbench model');
rejectText(workbench, 'const modelSelector', 'creation mode selector');
rejectText(workbench, 'const legacyModelSelector', 'legacy model selector');
rejectText(workbench, 't.wb_creation_mode_title', 'creation mode heading');
rejectText(workbench, "setSelectedModel('kling')", 'Kling workbench selection');
rejectText(workbench, 'wb_seedance_generation_notice', 'generation notice');
rejectText(translations, 'wb_seedance_generation_notice', 'localized generation notice');

console.log('Workbench Seedance-only source contract passed.');
