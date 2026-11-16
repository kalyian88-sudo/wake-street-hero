/**
 * ?debug overlay: compact stats panel + dev buttons. With only settings.showFps it shrinks to an FPS
 * counter. Text is refreshed a few times per second, never per frame.
 */
import { t } from '../i18n/i18n';
import type { FrameStats, QualitySetting, RiderSimState } from '../types';

export interface DebugHost {
  readonly stats: FrameStats;
  readonly qualityAuto: boolean;
  riderState(): RiderSimState | null;
  toggleHitboxes(): boolean;
  toggleFreeCam(): boolean;
  cycleQuality(): QualitySetting;
  /** Cycles the debug time multiplier and returns the new value. */
  cycleTimeScale(): number;
  unlockAll(): void;
  restartRun(): void;
}

const PANEL_CSS =
  'position:absolute;z-index:9999;left:max(6px,env(safe-area-inset-left));top:max(6px,env(safe-area-inset-top));' +
  'font:10px/1.3 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#fff;background:rgba(16,17,20,.78);' +
  'border-left:2px solid #E30613;border-radius:6px;padding:5px 7px;pointer-events:auto;max-width:190px;' +
  '-webkit-user-select:none;user-select:none;touch-action:manipulation';
const FPS_CSS =
  'position:absolute;z-index:9999;right:max(6px,env(safe-area-inset-right));top:max(4px,env(safe-area-inset-top));' +
  'font:10px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:rgba(255,255,255,.75);' +
  'text-shadow:0 1px 2px rgba(0,0,0,.8);pointer-events:none';
const BTN_CSS =
  'font:inherit;color:#fff;background:#3A3C43;border:0;border-radius:4px;padding:5px 4px;margin:0;' +
  'min-height:26px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
const BTN_ON = '#E30613';
const BTN_OFF = '#3A3C43';

export class DebugOverlay {
  private readonly panel: HTMLDivElement;
  private readonly text: HTMLPreElement;
  private readonly fps: HTMLDivElement;
  private readonly buttons: HTMLDivElement;
  private full = false;
  private fpsOnly = false;
  private acc = 1;
  private collapsed = false;

  constructor(
    parent: HTMLElement,
    private readonly host: DebugHost,
  ) {
    this.panel = document.createElement('div');
    this.panel.style.cssText = PANEL_CSS;
    this.panel.dataset.debug = 'panel';
    this.text = document.createElement('pre');
    this.text.style.cssText = 'margin:0 0 5px;font:inherit;white-space:pre';
    // Tap the read-out to fold the buttons away (keeps the screen clear for screenshots).
    this.text.addEventListener('click', () => {
      this.collapsed = !this.collapsed;
      this.buttons.style.display = this.collapsed ? 'none' : 'grid';
    });
    this.buttons = document.createElement('div');
    this.buttons.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:4px';
    this.panel.append(this.text, this.buttons);

    this.addToggle('core.debug.hitboxes', 'hitboxes', () => host.toggleHitboxes());
    this.addToggle('core.debug.freecam', 'freecam', () => host.toggleFreeCam());
    this.addAction('core.debug.cycleQuality', 'quality', () => void host.cycleQuality());
    this.addAction('core.debug.time', 'time', (b) => {
      const s = host.cycleTimeScale();
      b.textContent = `${t('core.debug.time')} ×${s}`;
      b.style.background = s === 1 ? BTN_OFF : BTN_ON;
    });
    this.addAction('core.debug.unlock', 'unlock', () => host.unlockAll());
    this.addAction('core.debug.restart', 'restart', () => host.restartRun());

    this.fps = document.createElement('div');
    this.fps.style.cssText = FPS_CSS;
    this.fps.dataset.debug = 'fps';

    this.panel.style.display = 'none';
    this.fps.style.display = 'none';
    parent.append(this.panel, this.fps);
    // Keep taps on the panel away from the joystick surface underneath.
    for (const type of ['pointerdown', 'touchstart', 'mousedown'] as const) {
      this.panel.addEventListener(type, (e) => e.stopPropagation());
    }
  }

  private makeButton(key: string, id: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.style.cssText = BTN_CSS;
    b.dataset.debug = id;
    b.dataset.key = key;
    b.textContent = t(key);
    this.buttons.append(b);
    return b;
  }

  private addToggle(key: string, id: string, fn: () => boolean): void {
    const b = this.makeButton(key, id);
    b.addEventListener('click', () => {
      b.style.background = fn() ? BTN_ON : BTN_OFF;
    });
  }

  private addAction(key: string, id: string, fn: (b: HTMLButtonElement) => void): void {
    const b = this.makeButton(key, id);
    b.addEventListener('click', () => fn(b));
  }

  /** `full` = ?debug panel, `fpsOnly` = settings.showFps counter (ignored while the panel is up). */
  setMode(full: boolean, fpsOnly: boolean): void {
    this.full = full;
    this.fpsOnly = fpsOnly && !full;
    this.panel.style.display = full ? 'block' : 'none';
    this.fps.style.display = this.fpsOnly ? 'block' : 'none';
    this.acc = 1;
  }

  /** Language changed: re-label the buttons. */
  relabel(): void {
    for (const b of Array.from(this.buttons.children) as HTMLElement[]) {
      if (b.dataset.key && b.dataset.debug !== 'time') b.textContent = t(b.dataset.key);
    }
  }

  update(realDt: number): void {
    if (!this.full && !this.fpsOnly) return;
    this.acc += realDt;
    if (this.acc < 0.25) return;
    this.acc = 0;
    const st = this.host.stats;
    if (this.fpsOnly) {
      this.fps.textContent = String(Math.round(st.fps));
      return;
    }
    const q = t(`core.quality.${st.quality}`) + (this.host.qualityAuto ? ` (${t('core.quality.auto')})` : '');
    const tris = st.triangles >= 1000 ? `${(st.triangles / 1000).toFixed(0)}k` : String(Math.round(st.triangles));
    let s =
      `${t('core.debug.fps')} ${st.fps.toFixed(0).padStart(3)}  ${t('core.debug.frame')} ${st.frameMs.toFixed(1)} ms\n` +
      `${t('core.debug.calls')} ${st.drawCalls}  ${t('core.debug.tris')} ${tris}\n` +
      `${t('core.debug.quality')} ${q}  DPR ${st.dpr}`;
    const r = this.host.riderState();
    if (r) {
      s +=
        `\n${t('core.debug.rider')} ${r.mode}  ${r.speed.toFixed(1)} ${t('core.debug.speed')}` +
        `\nxyz ${r.pos.x.toFixed(1)} ${r.pos.y.toFixed(1)} ${r.pos.z.toFixed(1)}`;
    }
    this.text.textContent = s;
  }

  dispose(): void {
    this.panel.remove();
    this.fps.remove();
  }
}
