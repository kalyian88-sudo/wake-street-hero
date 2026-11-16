/**
 * Menu UI root: builds the layers inside #ui, owns the screen manager and reacts to game state.
 *   boot/menu/preview → menus;  countdown/run → everything hidden;  paused → Pause;
 *   results → Results;  replay → hidden + "skip" bar.
 */
import { CITIES } from '../data/cities';
import { findSpot } from '../data/spots';
import { EventBus } from '../core/events';
import { detectLang, i18n, t } from '../i18n/i18n';
import { createSaveStore } from '../save/SaveStore';
import type { GameState, IGame, ISaveStore, IUI, Lang, ScreenId } from '../types';
import { setUnlockAll } from './career';
import { bindSfx } from './components/basic';
import { SafeGame, type Params, type Session, type UICtx } from './context';
import { h } from './dom';
import { Nav } from './nav';
import { Overlays } from './overlays';
import { registerScreens } from './screens';
import './styles/base.css';
import './styles/components.css';
import './styles/screens-menu.css';
import './styles/screens-play.css';
import './styles/screens-meta.css';

export type { DialogCard, DialogParams, DialogResult } from './screens/Dialog';

const RUN_SCREENS: readonly ScreenId[] = ['pause', 'results'];

function isBus(v: unknown): v is EventBus {
  return typeof v === 'object' && v !== null && typeof (v as EventBus).on === 'function' && typeof (v as EventBus).emit === 'function';
}

function isStore(v: unknown): v is ISaveStore {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as ISaveStore;
  return typeof s.update === 'function' && typeof s.data === 'object' && s.data !== null && typeof s.data.settings === 'object';
}

export function createUI(game: IGame): IUI {
  const g = new SafeGame(game);
  const bus = isBus(game.bus) ? game.bus : new EventBus();
  const save = isStore(game.save) ? game.save : createSaveStore(bus);
  const session: Session = {
    winch: new Map(),
    mode: new Map(),
    shopTab: null,
    tricksTab: null,
    riderTab: null,
    backdrop3D: false,
    before: null,
    cityId: null,
    board: 'wakeboard',
  };

  let nav: Nav | null = null;
  let overlays: Overlays | null = null;
  let root: HTMLElement | null = null;
  let started = false;
  let refreshQueued: Set<'save' | 'lang' | 'resize'> | null = null;
  let historyArmed = false;
  let pauseShownAt = 0;
  let ducked = false;
  let replaying = false;

  function duck(on: boolean): void {
    if (on === ducked) return;
    ducked = on;
    g.duck(on);
  }

  function queueRefresh(reason: 'save' | 'lang' | 'resize'): void {
    if (!refreshQueued) {
      refreshQueued = new Set();
      requestAnimationFrame(() => {
        const reasons = refreshQueued;
        refreshQueued = null;
        if (!reasons || !nav) return;
        // A language change rebuilds everything anyway.
        if (reasons.has('lang')) nav.refresh('lang');
        else if (reasons.has('save')) nav.refresh('save');
        if (reasons.has('resize')) nav.refresh('resize');
      });
    }
    refreshQueued.add(reason);
  }

  /** Change the language everywhere: i18n singleton, save, bus. */
  function setLang(lang: Lang): void {
    if (save.data.settings.lang !== lang) save.update((d) => (d.settings.lang = lang));
    if (i18n.lang !== lang) {
      i18n.setLang(lang);
      bus.emit('lang:changed', { lang });
    }
    g.applySettings();
  }

  function cityOfLastRun(): string {
    const spot = findSpot(g.lastResult?.config.spotId ?? save.data.last.spotId ?? '');
    return spot?.cityId ?? session.cityId ?? save.data.last.cityId ?? CITIES[0]?.id ?? '';
  }

  /** Leave the run layer (pause / results) and land on the city screen. */
  function returnToMenus(): void {
    if (!nav) return;
    overlays?.hideReplay();
    duck(false);
    if (nav.current === 'city' || nav.current === 'hub') return;
    const cityId = cityOfLastRun();
    session.cityId = cityId;
    nav.reset(
      [
        { id: 'hub', params: {} },
        { id: 'city', params: { cityId } },
      ],
      'fade',
    );
  }

  function hideForRun(): void {
    if (!nav) return;
    overlays?.closeAll();
    nav.prune(RUN_SCREENS);
    nav.hide();
    duck(false);
  }

  function onState(state: GameState, prev: GameState): void {
    if (!nav || !overlays) return;
    switch (state) {
      case 'countdown':
      case 'run':
        if (state === 'countdown' || (prev !== 'paused' && prev !== 'countdown')) session.before = { coins: save.data.coins, rep: save.data.rep };
        overlays.hideReplay();
        hideForRun();
        break;
      case 'paused':
        if (nav.has('pause')) break;
        pauseShownAt = performance.now();
        nav.go('pause');
        duck(true);
        break;
      case 'results':
        overlays.hideReplay();
        duck(false);
        if (nav.has('results')) nav.go('results', { instant: true });
        else {
          nav.prune(RUN_SCREENS);
          nav.go('results', { instant: prev === 'replay' });
        }
        break;
      case 'replay':
        nav.hide();
        overlays.showReplay(() => g.stopReplay());
        break;
      case 'menu':
        if (prev === 'run' || prev === 'paused' || prev === 'results' || prev === 'replay' || prev === 'countdown') returnToMenus();
        break;
      default:
        break;
    }
  }

  /** Back gesture / button / Esc. Returns false when there was nothing to go back to. */
  function handleBack(): boolean {
    if (!nav || !overlays) return false;
    if (overlays.dismissTop()) return true;
    if (overlays.replayVisible) {
      g.stopReplay();
      return true;
    }
    const cur = nav.current;
    if (cur === 'none') {
      const st = g.state;
      if (st === 'run' || st === 'countdown') {
        g.pauseRun();
        return true;
      }
      return false;
    }
    if (cur === 'splash') return false;
    if (cur === 'pause') {
      ctx.resume();
      return true;
    }
    if (cur === 'results') {
      ctx.quit();
      return true;
    }
    if (nav.back()) {
      g.sfx('ui.back');
      return true;
    }
    return false;
  }

  function armHistory(): void {
    if (historyArmed) return;
    try {
      history.pushState({ wn: 1 }, '');
      historyArmed = true;
    } catch {
      /* sandboxed frame */
    }
  }

  const ctx: UICtx = {
    g,
    bus,
    save,
    session,
    get nav(): Nav {
      if (!nav) throw new Error('UI not started');
      return nav;
    },
    sfx: (id) => g.sfx(id),
    toast: (text, kind) => overlays?.toast(text, kind),
    modal: (opts) => (overlays ? overlays.modal(opts) : Promise.resolve(null)),
    confirm: async (o) =>
      (await ctx.modal({
        title: o.title,
        text: o.text,
        icon: o.danger ? 'trash' : undefined,
        actions: [
          { value: 'ok', label: o.ok, kind: o.danger ? 'danger' : 'primary' },
          { value: 'cancel', label: o.cancel ?? t('ui.common.cancel'), kind: 'ghost' },
        ],
      })) === 'ok',
    go: (screen, params) => nav?.go(screen, params),
    back: () => void handleBack(),
    resume() {
      g.resumeRun();
      hideForRun();
    },
    restart() {
      g.restartRun();
      hideForRun();
    },
    quit() {
      g.quitRun();
      returnToMenus();
    },
    replay() {
      if (!nav || !overlays || replaying) return;
      replaying = true;
      nav.hide();
      overlays.showReplay(() => g.stopReplay());
      void g.playReplay().then(() => {
        replaying = false;
        overlays?.hideReplay();
        // A real game has already brought the results back through 'game:state'; a stub has not.
        const st = g.state;
        if (nav && nav.current === 'none' && nav.has('results') && st !== 'run' && st !== 'countdown') nav.go('results', { instant: true });
      });
    },
    setLang,
  };

  function start(): void {
    if (started || typeof document === 'undefined') return;
    started = true;
    setUnlockAll(g.debug);

    const host = document.getElementById('ui') ?? document.body.appendChild(h('div', { id: 'ui' }));
    const layer = h('div', { class: 'wn-screens' });
    root = h('div', { class: 'wn-ui' }, layer);
    host.appendChild(root);
    overlays = new Overlays(root);
    nav = new Nav(layer);
    nav.onChange = () => armHistory();
    bindSfx((id) => g.sfx(id));
    registerScreens(nav, ctx);

    // Language: explicit choice from the save, otherwise the device language.
    const wanted = save.data.settings.lang === 'auto' ? detectLang() : save.data.settings.lang;
    if (i18n.lang !== wanted) i18n.setLang(wanted);
    document.documentElement.lang = i18n.lang;

    bus.on('game:state', ({ state, prev }) => onState(state, prev));
    bus.on('save:changed', () => queueRefresh('save'));
    bus.on('lang:changed', () => queueRefresh('lang'));
    i18n.onChange(() => queueRefresh('lang'));
    bus.on('ui:toast', ({ text, kind }) => overlays?.toast(text, kind));
    window.addEventListener('resize', () => queueRefresh('resize'));
    window.addEventListener('orientationchange', () => queueRefresh('resize'));

    window.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape' || ev.repeat || !nav || !overlays) return;
      if (overlays.hasModal || overlays.replayVisible) {
        handleBack();
        return;
      }
      const cur = nav.current;
      if (cur === 'none') return; // pausing a run is the input module's job
      if (cur === 'pause') {
        // The same key press may just have paused the game (input → core → us): leave that alone,
        // and let the core's own Esc handling win when it has one.
        if (pauseShownAt >= ev.timeStamp - 30) return;
        window.setTimeout(() => {
          if (nav?.current === 'pause' && g.state !== 'run') ctx.resume();
        }, 140);
        return;
      }
      handleBack();
    });

    window.addEventListener('popstate', () => {
      historyArmed = false;
      if (handleBack()) armHistory();
      else if (nav?.current === 'hub') overlays?.toast(t('ui.common.exitHint'));
    });

    // Taps that fall through to the 3D canvas: let the backdrop resolve them to a city / spot.
    let down: { x: number; y: number; time: number } | null = null;
    document.addEventListener(
      'pointerdown',
      (ev) => {
        down = root && ev.target instanceof Node && root.contains(ev.target) ? null : { x: ev.clientX, y: ev.clientY, time: ev.timeStamp };
      },
      true,
    );
    document.addEventListener(
      'pointerup',
      (ev) => {
        const d = down;
        down = null;
        if (!d || !nav || overlays?.hasModal) return;
        if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 10 || ev.timeStamp - d.time > 500) return;
        const cur = nav.current;
        if (cur !== 'hub' && cur !== 'city') return;
        const hit = g.pickBackdrop(ev.clientX, ev.clientY);
        if (!hit) return;
        const screen = nav.screen as unknown as { pick?: (id: string, type: 'city' | 'spot') => void } | null;
        screen?.pick?.(hit.id, hit.type);
      },
      true,
    );

    // The game may already be past the menus (?autostart).
    const st = g.state;
    if (st === 'countdown' || st === 'run') {
      nav.reset([{ id: 'hub', params: {} }], 'fade');
      nav.hide();
    } else if (st === 'paused') {
      nav.reset([{ id: 'hub', params: {} }], 'fade');
      onState('paused', 'run');
    } else if (st === 'results') {
      nav.reset([{ id: 'hub', params: {} }], 'fade');
      onState('results', 'run');
    } else {
      nav.go('splash');
    }
  }

  return {
    start,
    show(screen: ScreenId, params?: Record<string, unknown>) {
      if (!started) start();
      nav?.go(screen, (params ?? {}) as Params);
    },
    get current(): ScreenId {
      return nav?.current ?? 'none';
    },
  };
}
