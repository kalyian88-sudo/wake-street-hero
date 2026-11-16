/**
 * Dev sandbox of the RULES + DATA module (no 3D): composed trick names in RU / EN, a scripted combo run
 * through the score keeper, the trick table, the gear catalogue with stat totals and the rider levels.
 *   /dev/rules.html            everything
 *   /dev/rules.html?lang=en    English
 *   /dev/rules.html?view=names|run|tricks|gear|levels   one section (for screenshots)
 */
import { levelForRep, RIDER_LEVELS } from '../career/progress';
import { goalReward, REWARDS, scoreCoins } from '../career/rewards';
import { BRAND, STARTER_GEAR } from '../config';
import { EventBus } from '../core/events';
import { computeStats, GEAR, GEAR_CATEGORIES, gearInCategory, STAT_KEYS } from '../data/gear';
import { EXTRA_TRICKS, TRICKS } from '../data/tricks';
import { judgeLanding } from '../tricks/landing';
import { createScoreKeeper, resolveTrick } from '../tricks/scoring';
import type { EquippedGear, L10n, LandingQuality, ResolvedTrick, TrickRecord } from '../types';

const params = new URLSearchParams(location.search);
const lang: 'ru' | 'en' = params.get('lang') === 'en' ? 'en' : 'ru';
const view = params.get('view');
const tx = (v: L10n): string => v[lang];
const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
const esc = (s: string): string => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] ?? c);
const num = (n: number): string => Math.round(n).toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US');

function rec(over: Partial<TrickRecord>): TrickRecord {
  return { board: 'wakeboard', context: 'air', takeoff: 'pop', spinDeg: 0, spinDir: null, inverts: [], grabs: [], flips: [], shifty: false, handlePass: false, switchTakeoff: false, switchLanding: false, airTime: 1, height: 1.3, ...over };
}

const gap = { id: 'gap_oldtown', name: { ru: 'Гэп Олд-Тауна', en: 'Old Town Gap' }, points: 500 };
const rail = (stances: NonNullable<TrickRecord['rail']>['stances'], distance: number, pressTime = 0, kind: 'rail' | 'ledge' | 'pipe' | 'handrail' = 'rail'): Partial<TrickRecord> => ({ context: 'rail', rail: { obstacleId: 'r', kind, stances, distance, pressTime } });

const SAMPLES: Partial<TrickRecord>[] = [
  { context: 'surface', spinDeg: 180 },
  { spinDeg: 180, spinDir: 'fs', switchLanding: true },
  { spinDeg: 360, spinDir: 'bs', grabs: [{ id: 'indy', hold: 0.6 }], handlePass: true },
  { grabs: [{ id: 'stalefish', hold: 1 }], shifty: true },
  { inverts: [{ id: 'backroll', count: 1 }], grabs: [{ id: 'melon', hold: 0.4 }] },
  { spinDeg: 360, inverts: [{ id: 'backroll', count: 1 }], grabs: [{ id: 'indy', hold: 0.5 }], handlePass: true },
  { spinDeg: 180, inverts: [{ id: 'frontroll', count: 1 }], switchLanding: true },
  { takeoff: 'kicker', inverts: [{ id: 'tantrum', count: 1 }], spinDeg: 360, height: 3.4, airTime: 1.5, handlePass: true },
  { takeoff: 'kicker', inverts: [{ id: 'tantrum', count: 2 }], height: 3.6, airTime: 1.6 },
  { inverts: [{ id: 'raley', count: 1 }], grabs: [{ id: 'tail', hold: 0.5 }] },
  { inverts: [{ id: 'raley', count: 1 }], spinDeg: 360, handlePass: true },
  { takeoff: 'kicker', spinDeg: 1080, spinDir: 'bs', switchTakeoff: true, grabs: [{ id: 'stalefish', hold: 1 }], handlePass: true, height: 4.1, airTime: 2, gap },
  { takeoff: 'kicker', gap, height: 2.6 },
  { takeoff: 'rail', spinDeg: 540, spinDir: 'fs', grabs: [{ id: 'mute', hold: 0.3 }, { id: 'nose', hold: 0.3 }], handlePass: true },
  { board: 'wakeskate', flips: [{ id: 'kickflip', count: 1 }] },
  { board: 'wakeskate', flips: [{ id: 'kickflip', count: 1 }, { id: 'shuvit', count: 1 }] },
  { board: 'wakeskate', spinDeg: -180, spinDir: 'bs', flips: [{ id: 'shuvit', count: 1 }] },
  { board: 'wakeskate', spinDeg: 180, spinDir: 'fs', flips: [{ id: 'heelflip', count: 1 }], switchTakeoff: true },
  { board: 'wakeskate', boneless: true, flips: [{ id: 'impossible', count: 1 }] },
  rail(['fifty'], 6.5),
  { ...rail(['fifty', 'boardslide'], 9, 0, 'handrail'), spinDeg: 180 },
  rail(['boardslide', 'nosepress'], 12.4, 1, 'ledge'),
  { context: 'wall', wall: { time: 1.4 } },
];

function trickCard(t: ResolvedTrick): string {
  const parts = t.parts.map((p) => `<li><span>${esc(tx(p.name))}</span><b>${num(p.points)}</b></li>`).join('');
  return `<article class="card t${t.tier}"><header><h3>${esc(tx(t.name))}</h3><b class="pts">${num(t.points)}</b></header>
    <p class="meta">tier ${t.tier} · +${t.elements ?? 1} mult · id <code>${t.id}</code></p><ul class="parts">${parts}</ul></article>`;
}

function namesSection(): string {
  return `<section><h2>Composed names (${lang})</h2>${SAMPLES.map((s) => trickCard(resolveTrick(rec(s)))).join('')}</section>`;
}

/** A scripted line through Old Town, fed through the real score keeper. */
function runSection(): string {
  const bus = new EventBus();
  const keeper = createScoreKeeper(bus);
  const rows: string[] = [];
  const push = (cls: string, a: string, b: string): number => rows.push(`<li class="${cls}"><span>${a}</span><b>${b}</b></li>`);
  bus.on('score:trick', (e) => push(`trick q-${e.landing}`, `${esc(tx(e.trick.name))} <i>${e.landing}${e.stale < 1 ? ` · stale ×${e.stale}` : ''}</i>`, `+${num(e.awarded)} <i>${num(e.comboPoints)} × ${e.comboMult}</i>`));
  bus.on('score:bank', (e) => push('bank', `BANK ${num(e.points)} × ${e.mult}`, `= ${num(e.banked)} → ${num(e.total)}`));
  bus.on('score:lost', (e) => push('lost', 'BAIL — combo lost', `−${num(e.points * e.mult)}`));
  bus.on('hero:ready', () => push('hero', 'HERO ready', ''));
  bus.on('hero:start', (e) => push('hero', `HERO ×2 for ${e.duration} s`, ''));
  bus.on('hero:end', () => push('hero', 'HERO over', ''));
  const land = (yawErrorDeg: number, over: Partial<TrickRecord>, gapS = 1): void => {
    const v = judgeLanding({ board: over.board ?? 'wakeboard', yawErrorDeg, rollErrorDeg: 0, grabbing: false, boardCaught: true, catchQuality: 1, impactSpeed: 6, ropeJerk: 0, surface: 'water', onto: 'water', landingStat: 5, hadTrick: true, heroActive: keeper.state.hero.active });
    if (v.quality === 'bail') keeper.bail();
    else keeper.addTrick(resolveTrick(rec(over)), v.quality as LandingQuality, 0);
    if (keeper.state.hero.ready) keeper.activateHero();
    keeper.update(gapS, false, gapS);
  };
  land(4, { takeoff: 'kicker', inverts: [{ id: 'tantrum', count: 1 }], height: 3.4, airTime: 1.5 });
  land(8, { context: 'surface', spinDeg: 180 });
  land(20, rail(['fifty', 'boardslide'], 11));
  land(6, { takeoff: 'rail', spinDeg: 360, spinDir: 'bs', grabs: [{ id: 'indy', hold: 0.5 }], handlePass: true });
  land(40, { spinDeg: 540, spinDir: 'fs', handlePass: true }, 4);
  land(3, { spinDeg: 360, spinDir: 'bs' });
  land(5, { spinDeg: 360, spinDir: 'bs' });
  land(70, { spinDeg: 720, spinDir: 'bs' }, 4);
  land(2, { takeoff: 'kicker', spinDeg: 360, inverts: [{ id: 'tantrum', count: 1 }], grabs: [{ id: 'mute', hold: 0.8 }], handlePass: true, height: 3.6, airTime: 1.6, gap });
  land(5, { context: 'wall', wall: { time: 1.3 } });
  land(9, { takeoff: 'wall', inverts: [{ id: 'backroll', count: 1 }], spinDeg: 180, switchLanding: true });
  land(4, { takeoff: 'kicker', spinDeg: 720, spinDir: 'fs', switchTakeoff: true, grabs: [{ id: 'stalefish', hold: 1 }], handlePass: true, height: 3.8, airTime: 1.7 });
  keeper.finish();
  const s = keeper.state;
  return `<section><h2>Scripted run → score keeper</h2><ul class="log">${rows.join('')}</ul>
    <p class="sum">total <b>${num(s.total)}</b> · best combo ${num(s.bestCombo)} · best trick ${esc(s.bestTrick ? tx(s.bestTrick.name) : '—')} (${num(s.bestTrick?.points ?? 0)}) · ${s.tricksLanded} tricks · ${s.falls} fall · pays ${scoreCoins(s.total)} coins</p></section>`;
}

function tricksSection(): string {
  const cats = [...new Set(TRICKS.map((t) => t.category))];
  const row = (t: (typeof TRICKS)[number]): string =>
    `<li><div><b>${esc(tx(t.name))}</b> <i>${'●'.repeat(t.difficulty)}${'○'.repeat(5 - t.difficulty)}</i> <em>${t.boards.map((b) => (b === 'wakeboard' ? 'WB' : 'WS')).join('+')}</em><p>${esc(tx(t.input))}</p>${t.tip ? `<p class="tip">${esc(tx(t.tip))}</p>` : ''}</div><b class="pts">${num(t.points)}</b></li>`;
  return `<section><h2>Trick table — ${TRICKS.length} rows (+${EXTRA_TRICKS.length} service)</h2>${cats.map((c) => `<h4>${c}</h4><ul class="table">${TRICKS.filter((t) => t.category === c).map(row).join('')}</ul>`).join('')}</section>`;
}

function gearSection(): string {
  const item = (g: (typeof GEAR)[number]): string => {
    const eq: EquippedGear = { ...STARTER_GEAR, [g.category]: g.id };
    const st = computeStats(eq, g.category === 'wakeskate' ? 'wakeskate' : 'wakeboard');
    const bars = STAT_KEYS.map((k) => {
      const d = g.stats[k] ?? 0;
      return `<div class="stat"><span>${k}</span><div class="bar"><i style="width:${st[k] * 10}%" class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}"></i></div><b>${d > 0 ? '+' : ''}${d || ''}</b></div>`;
    }).join('');
    return `<article class="card gear"><header><span class="sw" style="background:linear-gradient(135deg,${hex(g.look.primary)} 0 55%,${hex(g.look.secondary)} 55% 85%,${hex(g.look.accent)} 85%)"></span>
      <div><h3>${esc(tx(g.name))}</h3><p class="meta">${g.look.graphic}${g.unlockLevel ? ` · lvl ${g.unlockLevel}` : ''}</p></div><b class="pts">${g.price ? num(g.price) : 'start'}</b></header>
      <p class="desc">${esc(tx(g.desc))}</p>${bars}</article>`;
  };
  return `<section><h2>Gear — ${GEAR.length} items</h2>${GEAR_CATEGORIES.map((c) => `<h4>${c}</h4>${gearInCategory(c).map(item).join('')}`).join('')}</section>`;
}

function levelsSection(): string {
  const perSpot = (['score', 'trick', 'letters', 'line', 'clip'] as const).reduce((a, k) => ({ coins: a.coins + goalReward(k).coins, rep: a.rep + goalReward(k).rep }), { coins: REWARDS.fullClear.coins, rep: REWARDS.fullClear.rep });
  const rows = RIDER_LEVELS.map((lv, i) => `<li><span><b>${i + 1}</b> ${esc(tx(lv.title))}</span><b>${num(lv.rep)} rep</b></li>`).join('');
  const marks = [1, 4, 8, 12].map((spots) => `${spots} spot${spots > 1 ? 's' : ''} cleared ≈ lvl ${levelForRep(spots * perSpot.rep + spots * 8 * 10).level}, ${num(spots * perSpot.coins + spots * 8 * scoreCoins(10000))} coins`).join('<br>');
  return `<section><h2>Rider levels & economy</h2><ul class="log">${rows}</ul><p class="sum">a spot fully cleared: ${perSpot.coins} coins, ${perSpot.rep} rep · 10k run: ${scoreCoins(10000)} coins<br>${marks}</p></section>`;
}

const sections: Record<string, () => string> = { names: namesSection, run: runSection, tricks: tricksSection, gear: gearSection, levels: levelsSection };
const css = `
  html,body{margin:0;background:${BRAND.css.darker};color:#e9eaee;font:14px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  #app{max-width:820px;margin:0 auto;padding:12px 12px 40px}
  h1{font:italic 900 26px/1 "Arial Narrow","Roboto Condensed",Impact,sans-serif;letter-spacing:.5px;margin:6px 0 2px}h1 b{color:${BRAND.css.red}}
  h2{font:800 15px/1.2 system-ui;text-transform:uppercase;letter-spacing:1.2px;color:#9a9ca6;margin:26px 0 10px;border-bottom:1px solid #2b2d34;padding-bottom:6px}
  h4{margin:16px 0 6px;color:${BRAND.css.red};text-transform:uppercase;font-size:12px;letter-spacing:1.5px}
  .card{background:${BRAND.css.dark};border-radius:12px;padding:10px 12px;margin:0 0 8px;border-left:4px solid #3a3c43}
  .card.t2{border-left-color:#7d8190}.card.t3{border-left-color:#f2a53a}.card.t4{border-left-color:#ff5a1f}.card.t5{border-left-color:${BRAND.css.red}}
  .card header{display:flex;align-items:center;gap:10px}.card h3{margin:0;flex:1;font:italic 800 19px/1.1 "Arial Narrow","Roboto Condensed",sans-serif;text-transform:uppercase}
  .pts{font:800 17px/1 system-ui;color:#fff;white-space:nowrap}.meta{margin:3px 0 6px;color:#8a8d98;font-size:12px}code{color:#c9cbd3}
  .parts,.log,.table{list-style:none;margin:0;padding:0}.parts li,.log li,.table li{display:flex;justify-content:space-between;gap:12px;padding:2px 0;color:#b9bbc4}
  .parts b{color:#e9eaee;font-weight:600}.log li{padding:6px 10px;border-radius:8px;background:${BRAND.css.dark};margin-bottom:4px}.log i{color:#8a8d98;font-style:normal;font-size:12px;margin-left:6px}
  .log .bank{background:#173d2a;color:#b7f5cf}.log .lost{background:#4a1418;color:#ffc1c5}.log .hero{background:#3d2f0c;color:#ffe08a}.log .q-perfect span{color:#fff}.log .q-sketchy span{color:#f2a53a}
  .sum{color:#b9bbc4;margin:10px 2px}.sum b{color:#fff;font-size:18px}
  .table li{align-items:flex-start;padding:8px 10px;background:${BRAND.css.dark};border-radius:8px;margin-bottom:4px}.table p{margin:2px 0 0;color:#9a9ca6;font-size:12.5px}.table .tip{color:#6f727d}
  .table i{color:${BRAND.css.red};font-style:normal;font-size:10px;letter-spacing:1px}.table em{color:#6f727d;font-style:normal;font-size:11px;margin-left:4px}
  .gear .sw{width:38px;height:38px;border-radius:8px;flex:none;border:1px solid #3a3c43}.desc{color:#b9bbc4;margin:8px 0}
  .stat{display:grid;grid-template-columns:58px 1fr 34px;align-items:center;gap:8px;font-size:12px;color:#8a8d98}.stat b{color:#e9eaee;text-align:right}
  .bar{height:6px;background:#2b2d34;border-radius:3px;overflow:hidden}.bar i{display:block;height:100%;background:#7d8190}.bar .up{background:#3ecf7a}.bar .down{background:${BRAND.css.red}}
`;
const app = document.getElementById('app') as HTMLElement;
const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);
app.innerHTML = `<h1><b>WHY NOT</b> rules sandbox</h1>${(view && sections[view] ? [sections[view]] : Object.values(sections)).map((f) => f()).join('')}`;
(window as unknown as Record<string, unknown>).__rules = { ready: true };
