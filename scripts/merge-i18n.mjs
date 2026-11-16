#!/usr/bin/env node
/**
 * Merge per-module string files (src/i18n/parts/<module>.<lang>.json) into src/i18n/ru.json and en.json.
 * Keys already present in the main files win. Reports keys that exist in only one language.
 *   node scripts/merge-i18n.mjs          # merge
 *   node scripts/merge-i18n.mjs --check  # only report mismatches (exit 1 if any)
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'src/i18n';
const partsDir = join(dir, 'parts');
const check = process.argv.includes('--check');
const langs = ['ru', 'en'];
const main = Object.fromEntries(langs.map((l) => [l, JSON.parse(readFileSync(join(dir, `${l}.json`), 'utf8'))]));

if (existsSync(partsDir) && !check) {
  for (const f of readdirSync(partsDir).sort()) {
    const m = /^(.+)\.(ru|en)\.json$/.exec(f);
    if (!m) continue;
    const part = JSON.parse(readFileSync(join(partsDir, f), 'utf8'));
    for (const [k, v] of Object.entries(part)) if (!(k in main[m[2]])) main[m[2]][k] = v;
  }
  for (const l of langs) {
    const sorted = Object.fromEntries(Object.keys(main[l]).sort().map((k) => [k, main[l][k]]));
    writeFileSync(join(dir, `${l}.json`), JSON.stringify(sorted, null, 2) + '\n');
  }
}
const onlyRu = Object.keys(main.ru).filter((k) => !(k in main.en));
const onlyEn = Object.keys(main.en).filter((k) => !(k in main.ru));
console.log(`ru: ${Object.keys(main.ru).length} keys, en: ${Object.keys(main.en).length} keys`);
if (onlyRu.length) console.log('missing in en.json:', onlyRu.join(', '));
if (onlyEn.length) console.log('missing in ru.json:', onlyEn.join(', '));
if (check && (onlyRu.length || onlyEn.length)) process.exit(1);
