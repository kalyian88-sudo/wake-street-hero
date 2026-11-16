/**
 * CORE sandbox: boots the real createGame() with whatever modules exist right now (stubs are fine)
 * and autostarts a run. No menu UI — drive it with the keyboard / touch or through window.__wsh.
 *
 *   /dev/core.html                         run on phuket_oldtown, main line
 *   /dev/core.html?noauto                  stay in the (empty) menu state
 *   /dev/core.html?preview                 spot-card fly-along instead of a run
 *   + the game's own params: ?debug ?quality=low|medium|high|auto ?lang= ?spot= ?winch= ?board= ?power= ?mode=
 */
import { createGame } from '../core/Game';
import { readUrlParams } from '../core/urlParams';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const hudRoot = document.getElementById('hud') as HTMLElement;
const game = createGame({ canvas, hudRoot });

const params = readUrlParams();
const q = new URLSearchParams(location.search);
const spotId = params.spot ?? 'phuket_oldtown';
const winchId = params.winch ?? 'main';

const log: string[] = [];
(window as unknown as { __log: string[] }).__log = log;
game.bus.on('game:state', (e) => log.push(`state ${e.prev}→${e.state}`));
game.bus.on('run:countdown', (e) => log.push(`countdown ${e.n}`));
game.bus.on('run:go', () => log.push('go'));
game.bus.on('run:finish', (e) => log.push(`finish score=${e.result.score} stars=${e.result.stars}`));
game.bus.on('run:paused', (e) => log.push(`paused ${e.paused}`));
game.bus.on('run:quit', () => log.push('quit'));
game.bus.on('quality:changed', (e) => log.push(`quality ${e.level}${e.auto ? ' (auto)' : ''}`));

if (q.has('preview')) {
  void game.previewSpot(spotId, winchId);
} else if (!q.has('noauto')) {
  void game.startRun({
    spotId,
    winchId,
    board: params.board ?? 'wakeboard',
    power: params.power ?? 'medium',
    mode: params.mode ?? 'career',
  });
}
