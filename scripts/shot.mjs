#!/usr/bin/env node
/**
 * Headless screenshot / smoke helper (software WebGL via SwiftShader).
 *
 *   node scripts/shot.mjs --url http://localhost:5173/dev/water.html --shot /tmp/x/water.png
 *
 * Arguments are processed IN ORDER, so several steps can be chained in one browser session:
 *   --url <url>          navigate (first one is required)
 *   --w 390 --h 844      viewport (must come before --url; default 390x844 portrait phone)
 *   --dpr 1              deviceScaleFactor (before --url; default 1; use 2 for shots a person will look at)
 *   --desktop            no touch / not mobile (before --url)
 *   --wait <ms>          sleep
 *   --waitFor "<js>"     wait until the expression is truthy (timeout 60 s)
 *   --eval "<js>"        run JS in the page (may be async / return a value → printed)
 *   --key <Key>          keyboard press (e.g. Space, ArrowLeft, KeyX);  --keydown / --keyup hold & release
 *   --tap x,y            touchscreen tap at CSS px
 *   --shot <file.png>    screenshot
 * Prints console errors / page errors at the end and exits 1 if there were any page errors.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const argv = process.argv.slice(2);
const opts = { w: 390, h: 844, dpr: 1, desktop: false };
const steps = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const next = () => argv[++i];
  if (a === '--w') opts.w = +next();
  else if (a === '--h') opts.h = +next();
  else if (a === '--dpr') opts.dpr = +next();
  else if (a === '--desktop') opts.desktop = true;
  else if (a.startsWith('--')) steps.push([a.slice(2), next()]);
}
if (!steps.some((s) => s[0] === 'url')) {
  console.error('usage: node scripts/shot.mjs --url <url> [--wait ms] [--eval js] [--shot file.png] …');
  process.exit(2);
}

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
    '--no-sandbox',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const context = await browser.newContext({
  viewport: { width: opts.w, height: opts.h },
  deviceScaleFactor: opts.dpr,
  hasTouch: !opts.desktop,
  isMobile: !opts.desktop,
});
const page = await context.newPage();
const errors = [];
const warnings = [];
page.on('console', (m) => {
  const t = m.type();
  if (t === 'error') errors.push(m.text());
  else if (t === 'warning') warnings.push(m.text());
});
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + (e.stack || e.message)));
page.on('requestfailed', (r) => errors.push('REQUESTFAILED: ' + r.url() + ' ' + (r.failure()?.errorText ?? '')));

for (const [kind, val] of steps) {
  try {
    if (kind === 'url') await page.goto(val, { waitUntil: 'load', timeout: 60000 });
    else if (kind === 'wait') await page.waitForTimeout(+val);
    else if (kind === 'waitFor') await page.waitForFunction(val, undefined, { timeout: 60000 });
    else if (kind === 'eval') {
      const r = await page.evaluate(`(async () => { return (${val}); })()`);
      if (r !== undefined) console.log('eval →', typeof r === 'string' ? r : JSON.stringify(r));
    } else if (kind === 'key') await page.keyboard.press(val);
    else if (kind === 'keydown') await page.keyboard.down(val);
    else if (kind === 'keyup') await page.keyboard.up(val);
    else if (kind === 'tap') {
      const [x, y] = val.split(',').map(Number);
      await page.touchscreen.tap(x, y);
    } else if (kind === 'shot') {
      mkdirSync(dirname(val), { recursive: true });
      await page.screenshot({ path: val });
      console.log('shot →', val);
    } else console.error('unknown step --' + kind);
  } catch (e) {
    errors.push(`STEP --${kind} ${String(val).slice(0, 80)} failed: ${e.message}`);
  }
}
await browser.close();
if (warnings.length) console.log(`console warnings (${warnings.length}):\n  ` + [...new Set(warnings)].slice(0, 12).join('\n  '));
if (errors.length) {
  console.log(`console/page ERRORS (${errors.length}):\n  ` + [...new Set(errors)].slice(0, 20).join('\n  '));
  process.exit(1);
}
console.log('no console errors');
