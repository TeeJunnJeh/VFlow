import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const translationsFile = path.join(projectRoot, 'src', 'i18n', 'translations.ts');
const srcRoot = path.join(projectRoot, 'src');

function walkFiles(dir, exts, collected = []) {
  if (!fs.existsSync(dir)) return collected;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'dist' || entry.name === 'node_modules') continue;
      walkFiles(fullPath, exts, collected);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (exts.has(ext)) collected.push(fullPath);
  }
  return collected;
}

function loadTranslations() {
  const content = fs.readFileSync(translationsFile, 'utf8');
  const match = content.match(/export\s+const\s+translations\s*=\s*([\s\S]*);\s*$/);
  if (!match) throw new Error('Failed to parse translations.ts: export const translations not found.');
  const literal = match[1];
  const obj = Function(`"use strict"; return (${literal});`)();
  if (!obj || typeof obj !== 'object') throw new Error('translations.ts did not evaluate to an object.');
  return obj;
}

function scanUsedI18nKeys() {
  const files = walkFiles(srcRoot, new Set(['.ts', '.tsx']));
  const used = new Set();
  const keyRegex = /\bt\.([A-Za-z0-9_]+)/g;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = keyRegex.exec(content)) !== null) {
      const key = match[1];
      if (!key.includes('_')) continue;
      used.add(key);
    }
  }
  return used;
}

function main() {
  const translations = loadTranslations();
  const langs = Object.keys(translations);
  if (!langs.includes('en')) {
    console.error('i18n scan failed: missing base language "en".');
    process.exit(1);
  }

  const en = translations.en || {};
  const enKeys = Object.keys(en);
  const usedKeys = scanUsedI18nKeys();
  const strictLangs = new Set(['zh']);

  const missingInEn = Array.from(usedKeys).filter((k) => !(k in en));
  let hasError = false;

  if (missingInEn.length > 0) {
    hasError = true;
    console.error('\n[ERROR] i18n keys used in code but missing in en:');
    for (const key of missingInEn.sort()) console.error(`  - ${key}`);
  }

  for (const lang of langs) {
    if (lang === 'en') continue;
    const dict = translations[lang] || {};

    const missing = enKeys.filter((key) => !(key in dict));
    const empty = enKeys.filter((key) => key in dict && String(dict[key] ?? '').trim() === '');
    const untranslated = enKeys.filter((key) => key in dict && dict[key] === en[key]);

    if (missing.length > 0) {
      if (strictLangs.has(lang)) {
        hasError = true;
        console.error(`\n[ERROR] Missing keys in ${lang}:`);
        for (const key of missing.sort()) console.error(`  - ${key}`);
      } else {
        console.warn(`\n[WARN] Missing keys in ${lang}:`);
        for (const key of missing.sort()) console.warn(`  - ${key}`);
      }
    }

    if (empty.length > 0) {
      if (strictLangs.has(lang)) {
        hasError = true;
        console.error(`\n[ERROR] Empty translations in ${lang}:`);
        for (const key of empty.sort()) console.error(`  - ${key}`);
      } else {
        console.warn(`\n[WARN] Empty translations in ${lang}:`);
        for (const key of empty.sort()) console.warn(`  - ${key}`);
      }
    }

    if (untranslated.length > 0) {
      console.warn(`\n[WARN] Untranslated keys in ${lang} (same as en):`);
      for (const key of untranslated.sort()) console.warn(`  - ${key}`);
    }
  }

  if (hasError) {
    console.error('\ni18n scan failed.');
    process.exit(1);
  }

  console.log(`i18n scan passed. languages=${langs.length}, enKeys=${enKeys.length}, usedKeys=${usedKeys.size}`);
}

main();
