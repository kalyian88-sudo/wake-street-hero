import { createGame } from './core/Game';
import { readUrlParams } from './core/urlParams';
import { findSpot } from './data/spots';
import { createUI } from './ui/UI';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const hudRoot = document.getElementById('hud') as HTMLElement;

// createGame also installs the test hooks: window.__game and window.__wsh (see src/core/testHooks.ts).
const game = createGame({ canvas, hudRoot });
const ui = createUI(game);
ui.start();

// ?spot=<id>&winch=<id>&board=<kind>&power=<level>&mode=<mode>&autostart → jump straight into a run.
const params = readUrlParams();
if (params.autostart) {
  const last = game.save.data.last;
  const spot = findSpot(params.spot ?? last.spotId ?? 'phuket_oldtown') ?? findSpot('phuket_oldtown');
  if (spot) {
    const winch = spot.winchPoints.find((w) => w.id === params.winch) ?? spot.winchPoints[0];
    ui.show('none');
    void game
      .startRun({
        spotId: spot.id,
        winchId: winch.id,
        board: params.board ?? last.board,
        power: params.power ?? last.power,
        mode: params.mode ?? 'career',
      })
      .catch((err: unknown) => console.error('[main] autostart failed', err));
  }
}
