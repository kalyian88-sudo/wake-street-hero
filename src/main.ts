import { createGame } from './core/Game';
import { createUI } from './ui/UI';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const hudRoot = document.getElementById('hud') as HTMLElement;

const game = createGame({ canvas, hudRoot });
const ui = createUI(game);
ui.start();
