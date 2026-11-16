/**
 * UI sandbox: the real createUI() over a mock IGame (real EventBus, real save store under its own key,
 * the i18n singleton, no-op audio / input / hud). Open /dev/ui.html and drive it from the console:
 *
 *   __ui.go('hub' | 'city' | 'spot' | 'results' | 'pause' | 'settings' | 'tricks' | 'shop' | 'rider' | 'dialog', params?)
 *   __ui.lang('ru' | 'en')
 *   __ui.fake.progress('fresh' | 'mid' | 'rich')   — preset save
 *   __ui.fake.coins(n) / rep(n) / stars(spotId, n) / lockAll()
 *   __ui.fake.results({ score, newGoals, free, levelUp })    — finish a fake run → Results
 *   __ui.fake.state('paused' | 'run' | …)          — emit a game state
 *   __ui.fake.markers(true)                        — pretend the 3D backdrop exists (projectMarker answers)
 *   __ui.fake.dialog()                             — sample crew dialogue
 *
 * URL: ?screen=<id>&lang=ru|en&preset=mid&spot=<id>&city=<id>&tab=<x>&free&levelup&nostore
 */
import { GAME, SAVE_KEY } from '../config';
import { EventBus } from '../core/events';
import { CITIES } from '../data/cities';
import { GEAR } from '../data/gear';
import { SPOTS } from '../data/spots';
import { TRICKS } from '../data/tricks';
import { i18n } from '../i18n/i18n';
import { createSaveStore } from '../save/SaveStore';
import type { GameState, GearItem, IAudio, IGame, IHud, IInput, Lang, MenuBackdrop, RunConfig, RunResult, ScreenId } from '../types';
import { createUI, type DialogCard } from '../ui/UI';
import { makeStub } from './stub';

const query = new URLSearchParams(location.search);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const fake3d = document.getElementById('fake3d') as HTMLElement;
const runLabel = document.getElementById('runlabel') as HTMLElement;

const bus = new EventBus();
const save = createSaveStore(bus, { key: `${SAVE_KEY}.ui-sandbox`, storage: query.has('nostore') ? null : undefined });

// The gear catalogue may still be the 6-item stub: add a few rich items so the shop can be judged.
if (GEAR.length <= 6) {
  const mk = (id: string, category: GearItem['category'], ru: string, en: string, price: number, stats: GearItem['stats'], graphic: GearItem['look']['graphic'], colors: [number, number, number], extra: Partial<GearItem> = {}): GearItem => ({
    id,
    category,
    name: { ru, en },
    desc: { ru: 'Демо-описание из песочницы: жёсткий флекс, быстрый кант, злой поп.', en: 'Sandbox demo copy: stiff flex, fast edge, angry pop.' },
    price,
    stats,
    look: { primary: colors[0], secondary: colors[1], accent: colors[2], graphic },
    ...extra,
  });
  for (const g of GEAR) {
    if (!g.desc.ru) g.desc = { ru: 'Стартовый комплект. Прощает ошибки.', en: 'Starter kit. Forgiving.' };
  }
  GEAR.push(
    mk('wb_pro', 'wakeboard', 'WHY NOT Pro Rocker', 'WHY NOT Pro Rocker', 900, { pop: 1.5, spin: 0.5, landing: -0.5 }, 'stripe', [0x1c1d21, 0xe30613, 0xffffff]),
    mk('wb_flames', 'wakeboard', 'WHY NOT Inferno', 'WHY NOT Inferno', 2400, { pop: 2, spin: 1.5, rail: -1, landing: -1 }, 'flames', [0x101114, 0xe30613, 0xffc531], { unlockLevel: 6 }),
    mk('wb_camo', 'wakeboard', 'WHY NOT Jungle', 'WHY NOT Jungle', 1500, { rail: 2, landing: 1, pop: -0.5 }, 'camo', [0x3d5a3a, 0x24361f, 0xd9c7a0]),
    mk('bd_pro', 'bindings', 'WHY NOT Lock Pro', 'WHY NOT Lock Pro', 1200, { landing: 2, spin: 0.5 }, 'split', [0xffffff, 0x1c1d21, 0xe30613]),
    mk('ws_checker', 'wakeskate', 'WHY NOT Checker', 'WHY NOT Checker', 800, { catch: 2, pop: 0.5 }, 'checker', [0xffffff, 0x1c1d21, 0xe30613]),
    mk('vest_pro', 'vest', 'WHY NOT Impact Pro', 'WHY NOT Impact Pro', 600, { landing: 1 }, 'tape', [0x1c1d21, 0xe30613, 0xffffff]),
    mk('cap_red', 'helmet', 'Кепка WHY NOT', 'WHY NOT Cap', 300, {}, 'logo', [0xe30613, 0x1c1d21, 0xffffff], { headKind: 'cap' }),
    mk('hoodie', 'apparel', 'Худи WHY NOT', 'WHY NOT Hoodie', 700, {}, 'logo', [0x1c1d21, 0xe30613, 0xffffff], { apparelKind: 'hoodie' }),
    mk('wetsuit', 'apparel', 'Гидрик 3/2', 'Wetsuit 3/2', 1100, { landing: 0.5 }, 'plain', [0x2a5fd0, 0x101114, 0xffffff], { apparelKind: 'wetsuit' }),
  );
}

let state: GameState = 'menu';
let lastResult: RunResult | null = null;
let lastConfig: RunConfig = { spotId: SPOTS[0]?.id ?? '', winchId: SPOTS[0]?.winchPoints[0]?.id ?? '', power: 'medium', board: 'wakeboard', mode: 'career' };
let markers3D = query.has('markers');
let replayDone: (() => void) | null = null;
let runToken = 0;

function setState(next: GameState): void {
  if (next === state) return;
  const prev = state;
  state = next;
  const inRun = next === 'countdown' || next === 'run' || next === 'replay' || next === 'paused';
  runLabel.style.display = inRun ? 'block' : 'none';
  runLabel.textContent = next === 'countdown' ? '3 · 2 · 1' : next === 'replay' ? 'REPLAY (mock)' : `${next.toUpperCase()} (mock)\nP — pause · F — finish`;
  if (inRun || next === 'results') fake3d.dataset.kind = 'run';
  bus.emit('game:state', { state: next, prev });
}

function makeResult(o: { score?: number; newGoals?: number[]; free?: boolean; levelUp?: boolean; record?: boolean } = {}): RunResult {
  const spot = SPOTS.find((s) => s.id === lastConfig.spotId) ?? SPOTS[0];
  const before = save.data.spots[spot.id]?.goals ?? [false, false, false, false, false];
  const newGoals = o.free ? [] : (o.newGoals ?? [0, 2, 4]).filter((i) => !before[i]);
  const goals = before.map((g, i) => g || newGoals.includes(i));
  const best = TRICKS.find((t) => t.id === 'backroll') ?? TRICKS[0];
  return {
    config: { ...lastConfig, spotId: spot.id, mode: o.free ? 'free' : lastConfig.mode },
    score: o.score ?? 12480,
    bestTrick: { name: best?.name ?? { ru: 'Бэкролл', en: 'Backroll' }, points: 1350, time: 12.4 },
    bestCombo: 5640,
    tricksLanded: 14,
    falls: o.score === 0 ? 3 : 1,
    duration: 48,
    letters: [true, true, true, true, true, true],
    goals,
    newGoals,
    coins: o.free ? 0 : 340,
    rep: o.free ? 0 : o.levelUp ? 400 : 120,
    newRecord: o.record ?? true,
    stars: goals.filter(Boolean).length,
  };
}

function finishRun(o: Parameters<typeof makeResult>[0] = {}): void {
  runToken++;
  const result = makeResult(o);
  lastResult = result;
  const before = { coins: save.data.coins, rep: save.data.rep };
  setStateSilently('run');
  save.update((d) => {
    const sp = (d.spots[result.config.spotId] ??= { goals: [false, false, false, false, false], bestScore: 0, bestCombo: 0, bestTrick: null, runs: 0 });
    sp.goals = result.goals.slice();
    sp.bestScore = Math.max(sp.bestScore, result.score);
    sp.runs++;
    d.coins = before.coins + result.coins;
    d.rep = before.rep + result.rep;
  });
  bus.emit('run:finish', { result });
  setState('results');
}

/** Put the mock into a state without telling the UI (so the next real transition has a sane `prev`). */
function setStateSilently(next: GameState): void {
  state = next;
}

async function runFlow(): Promise<void> {
  const token = ++runToken;
  await sleep(500);
  if (token !== runToken) return;
  setState('countdown');
  await sleep(1200);
  if (token !== runToken) return;
  setState('run');
}

const audio: IAudio = {
  unlock: () => undefined,
  unlocked: true,
  setVolumes: () => undefined,
  playMusic: () => undefined,
  stopMusic: () => undefined,
  setDucked: () => undefined,
  tracks: [],
  play: () => undefined,
  update: () => undefined,
  suspend: () => undefined,
  resume: () => undefined,
};

function fakeMarker(type: 'city' | 'spot', id: string): { x: number; y: number; visible: boolean } | null {
  if (!markers3D) return null;
  const list = type === 'city' ? CITIES.map((c) => c.id) : SPOTS.map((s) => s.id);
  const i = list.indexOf(id);
  if (i < 0) return null;
  const t = performance.now() / 1000;
  const landscape = innerWidth > innerHeight;
  const cx = landscape ? innerWidth * 0.68 : innerWidth * 0.5;
  const cy = landscape ? innerHeight * 0.5 : innerHeight * 0.4;
  const r = Math.min(innerWidth, innerHeight) * 0.24;
  const a = t * 0.15 + (i * Math.PI * 2) / Math.max(1, list.length);
  return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.6, visible: true };
}

const game: IGame = {
  bus,
  save,
  i18n,
  audio,
  input: makeStub<IInput>({ vibrate: () => undefined }),
  hud: makeStub<IHud>(),
  get state() {
    return state;
  },
  debug: query.has('debug'),
  setBackdrop(b: MenuBackdrop) {
    fake3d.dataset.kind = b.kind;
  },
  async previewSpot() {
    fake3d.dataset.kind = 'run';
    if (state === 'menu') setState('preview');
  },
  setPreviewLine: () => undefined,
  async startRun(cfg: RunConfig) {
    lastConfig = cfg;
    await runFlow();
  },
  restartRun() {
    void runFlow();
  },
  pauseRun() {
    if (state === 'run' || state === 'countdown') setState('paused');
  },
  resumeRun() {
    if (state === 'paused') setState('run');
  },
  quitRun() {
    runToken++;
    setState('menu');
  },
  get lastResult() {
    return lastResult;
  },
  playReplay() {
    return new Promise<void>((resolve) => {
      setState('replay');
      replayDone = resolve;
      setTimeout(() => game.stopReplay(), 5000);
    });
  },
  stopReplay() {
    if (state !== 'replay') return;
    setState('results');
    replayDone?.();
    replayDone = null;
  },
  renderBestFrame: async () => null,
  applySettings: () => undefined,
  pickBackdrop: () => null,
  projectMarker: fakeMarker,
};

window.addEventListener('keydown', (ev) => {
  if (ev.code === 'KeyP' && state === 'run') game.pauseRun();
  if (ev.code === 'KeyF' && state === 'run') finishRun();
});

const ui = createUI(game);

const dialogCards: DialogCard[] = [
  {
    speaker: 'winch',
    text: { ru: 'Йо! Лебёдка заряжена, канал пустой. Держи ПРЫЖОК, чтобы зарядить канат, и отпускай на поп. Не дёргай — тяни плавно.', en: 'Yo! Winch is fuelled, canal is empty. Hold JUMP to load the rope and let go to pop. Easy on it — pull smooth.' },
  },
  {
    speaker: 'filmer',
    text: { ru: 'Я стою у гэпа с камерой. Сделай там что-нибудь стильное — клип улетит в сторис.', en: 'I am at the gap with the camera. Do something stylish there and the clip goes straight to stories.' },
  },
  {
    speaker: 'manager',
    title: { ru: 'Оффер от WHY NOT', en: 'An offer from WHY NOT' },
    text: { ru: 'Собери 10 звёзд на Пхукете — и доска Pro Rocker твоя. Плюс место в команде на московский этап.', en: 'Get 10 stars in Phuket and the Pro Rocker deck is yours. Plus a team spot for the Moscow stop.' },
    reward: { coins: 500, rep: 150 },
    accept: { ru: 'Беру!', en: 'I am in!' },
    decline: { ru: 'Потом', en: 'Later' },
  },
];

const api = {
  ui,
  game,
  bus,
  save,
  i18n,
  go(screen: ScreenId, params?: Record<string, unknown>): void {
    ui.show(screen, params);
  },
  lang(lang: Lang): void {
    save.update((d) => (d.settings.lang = lang));
    i18n.setLang(lang);
    bus.emit('lang:changed', { lang });
  },
  fake: {
    coins: (n: number) => save.update((d) => (d.coins = n)),
    rep: (n: number) => save.update((d) => (d.rep = n)),
    stars(spotId: string, n: number): void {
      save.update((d) => {
        const sp = (d.spots[spotId] ??= { goals: [false, false, false, false, false], bestScore: 0, bestCombo: 0, bestTrick: null, runs: 0 });
        sp.goals = sp.goals.map((_, i) => i < n);
        sp.bestScore = Math.max(sp.bestScore, n * 2600);
        sp.runs = Math.max(sp.runs, n);
      });
    },
    progress(preset: 'fresh' | 'mid' | 'rich'): void {
      save.reset();
      if (preset === 'fresh') return;
      save.update((d) => {
        d.career.tutorialDone = true;
        d.coins = preset === 'rich' ? 12850 : 1240;
        d.rep = preset === 'rich' ? 2100 : 520;
        SPOTS.forEach((s, i) => {
          const n = preset === 'rich' ? 5 : Math.max(0, 3 - i);
          d.spots[s.id] = { goals: [0, 1, 2, 3, 4].map((k) => (preset === 'rich' ? true : k === 0 || k === 2 || (k === 4 && n > 2))), bestScore: preset === 'rich' ? 28400 : 7350, bestCombo: 3200, bestTrick: null, runs: 9 };
        });
        TRICKS.slice(0, preset === 'rich' ? 40 : 14).forEach((t, i) => (d.stats.tricksLanded[t.id] = 1 + ((i * 7) % 23)));
        if (preset === 'rich') d.ownedGear.push('wb_pro', 'bd_pro', 'vest_pro');
      });
    },
    lockAll: () => save.update((d) => (d.spots = {})),
    results: (o: Parameters<typeof makeResult>[0] = {}) => finishRun(o),
    state: (s: GameState) => setState(s),
    markers(on: boolean): void {
      markers3D = on;
    },
    dialog(cards: DialogCard[] = dialogCards): void {
      ui.show('dialog', { cards, onDone: (r: unknown) => console.info('[sandbox] dialog done', r) });
    },
    letters: GAME.letters,
  },
};

(window as unknown as { __ui: typeof api }).__ui = api;

// ── boot from the URL ──
const preset = query.get('preset');
if (preset === 'fresh' || preset === 'mid' || preset === 'rich') api.fake.progress(preset);
const lang = query.get('lang');
if (lang === 'ru' || lang === 'en') save.update((d) => (d.settings.lang = lang));

ui.start();

const screen = query.get('screen') as ScreenId | null;
if (screen) {
  const spotId = query.get('spot') ?? SPOTS[0]?.id;
  const cityId = query.get('city') ?? CITIES[0]?.id;
  lastConfig = { ...lastConfig, board: query.has('skate') ? 'wakeskate' : 'wakeboard' };
  if (screen !== 'splash') ui.show('hub');
  if (screen === 'city' || screen === 'spot') ui.show('city', { cityId });
  if (screen === 'spot') ui.show('spot', { spotId });
  else if (screen === 'results') {
    ui.show('city', { cityId });
    setStateSilently('run');
    finishRun({ free: query.has('free'), levelUp: query.has('levelup'), score: query.has('score') ? Number(query.get('score')) : undefined });
  } else if (screen === 'pause') {
    ui.show('city', { cityId });
    setStateSilently('run');
    setState('paused');
  } else if (screen === 'dialog') api.fake.dialog();
  else if (screen === 'shop') ui.show('shop', query.get('tab') ? { category: query.get('tab') } : {});
  else if (screen !== 'hub' && screen !== 'city' && screen !== 'splash') {
    const tab = query.get('tab');
    ui.show(screen, tab ? { tab } : {});
  }
}
